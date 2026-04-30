import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getPosts, getClients } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function googleErrMsg(err: unknown, step: string): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    // googleapis wraps API errors in err.response.data.error
    const apiErr = (e.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (apiErr?.error) {
      const ae = apiErr.error as Record<string, unknown>;
      return `[${step}] ${ae.message ?? ae.status ?? JSON.stringify(ae)} (HTTP ${(e.response as Record<string, unknown>)?.status ?? "?"})`;
    }
    if (typeof e.message === "string") return `[${step}] ${e.message}`;
  }
  return `[${step}] Unknown error`;
}

export async function POST() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const shareEmail = process.env.GOOGLE_SHEETS_SHARE_EMAIL;

  if (!serviceAccountJson) {
    return NextResponse.json(
      { error: "GOOGLE_SERVICE_ACCOUNT_JSON is not set in Vercel. Paste the full contents of the .json key file as that variable's value." },
      { status: 500 }
    );
  }
  if (!shareEmail) {
    return NextResponse.json(
      { error: "GOOGLE_SHEETS_SHARE_EMAIL is not set. Set it to the email that should receive the sheet." },
      { status: 500 }
    );
  }

  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    return NextResponse.json(
      { error: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the full file contents including the opening { and closing }." },
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
      { error: "No published posts to export yet." },
      { status: 400 }
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const today = new Date().toISOString().slice(0, 10);
  const title = `CS Design Studios — Published Blogs (${today})`;

  // Step 1: create the spreadsheet in the user's shared Drive folder.
  // The service account has no Drive storage quota in this Workspace org, so
  // it must write into a folder owned by the user (shared with the service account as Editor).
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json(
      { error: "GOOGLE_DRIVE_FOLDER_ID is not set. Create a folder in your Google Drive, share it with the service account as Editor, then paste the folder ID from the URL into that Vercel env var." },
      { status: 500 }
    );
  }

  let spreadsheetId: string;
  let spreadsheetUrl: string;
  const firstSheetId = 0;
  try {
    const driveResp = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [folderId],
      },
      fields: "id,webViewLink",
    });
    if (!driveResp.data.id || !driveResp.data.webViewLink) {
      return NextResponse.json({ error: "[create via Drive] Google returned no file ID/link." }, { status: 500 });
    }
    spreadsheetId = driveResp.data.id;
    spreadsheetUrl = driveResp.data.webViewLink;
  } catch (err) {
    return NextResponse.json({ error: googleErrMsg(err, "create spreadsheet in folder") }, { status: 500 });
  }

  // Step 2: write the data
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          ["Client Name", "Blog URL"],
          ...rows.map((r) => [r.clientName, r.url]),
        ],
      },
    });
  } catch (err) {
    return NextResponse.json({ error: googleErrMsg(err, "write data") }, { status: 500 });
  }

  // Step 3: format (bold header, freeze row, auto-resize)
  try {
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
  } catch (err) {
    return NextResponse.json({ error: googleErrMsg(err, "format sheet") }, { status: 500 });
  }

  // Step 4: share with user (non-fatal if it fails)
  let shareWarning: string | undefined;
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: { type: "user", role: "writer", emailAddress: shareEmail },
    });
  } catch (shareErr) {
    shareWarning = `Sheet created but sharing with ${shareEmail} failed: ${googleErrMsg(shareErr, "share")}. Find it in the service account's Drive or open via the link.`;
  }

  return NextResponse.json({
    url: spreadsheetUrl,
    title,
    rowCount: rows.length,
    sharedWith: shareEmail,
    shareWarning,
  });
}
