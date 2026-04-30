import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getPosts, getClients } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const shareEmail = process.env.GOOGLE_SHEETS_SHARE_EMAIL;

    if (!serviceAccountJson) {
      return NextResponse.json(
        { error: "GOOGLE_SERVICE_ACCOUNT_JSON env var is not set in Vercel. Paste the entire contents of the service account .json key file as that variable's value." },
        { status: 500 }
      );
    }
    if (!shareEmail) {
      return NextResponse.json(
        { error: "GOOGLE_SHEETS_SHARE_EMAIL env var is not set. Set it to the Google account email that should receive the sheet." },
        { status: 500 }
      );
    }

    let credentials: { client_email?: string; private_key?: string };
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      return NextResponse.json(
        { error: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Make sure you pasted the full contents of the .json file (including the curly braces)." },
        { status: 500 }
      );
    }
    if (!credentials.client_email || !credentials.private_key) {
      return NextResponse.json(
        { error: "Service account JSON is missing client_email or private_key. Re-download the key file from Google Cloud Console." },
        { status: 500 }
      );
    }

    const [posts, clients] = await Promise.all([getPosts(), getClients()]);
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    const rows = posts
      .filter((p) => p.status === "published" && p.publishedUrl)
      .map((p) => ({
        clientName: clientMap.get(p.clientId)?.businessName || "Unknown",
        url: p.publishedUrl!,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.url.localeCompare(b.url));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No published posts to export yet — publish some posts first." },
        { status: 400 }
      );
    }

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    const today = new Date().toISOString().slice(0, 10);
    const title = `CS Design Studios — Published Blogs (${today})`;

    const createResp = await sheets.spreadsheets.create({
      requestBody: { properties: { title } },
    });

    const spreadsheetId = createResp.data.spreadsheetId;
    const spreadsheetUrl = createResp.data.spreadsheetUrl;
    const firstSheetId = createResp.data.sheets?.[0]?.properties?.sheetId ?? 0;

    if (!spreadsheetId || !spreadsheetUrl) {
      return NextResponse.json(
        { error: "Sheet was created but Google didn't return an ID/URL. Try again." },
        { status: 500 }
      );
    }

    const values: (string | number)[][] = [
      ["Client Name", "Blog URL"],
      ...rows.map((r) => [r.clientName, r.url]),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: firstSheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: firstSheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: firstSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 2 },
            },
          },
        ],
      },
    });

    let shareWarning: string | undefined;
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        sendNotificationEmail: false,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: shareEmail,
        },
      });
    } catch (shareErr) {
      shareWarning = `Sheet was created but sharing with ${shareEmail} failed: ${
        shareErr instanceof Error ? shareErr.message : "unknown error"
      }. The link still works for the service account — open it manually.`;
    }

    return NextResponse.json({
      url: spreadsheetUrl,
      title,
      rowCount: rows.length,
      sharedWith: shareEmail,
      shareWarning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Google Sheet" },
      { status: 500 }
    );
  }
}
