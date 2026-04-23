import { NextRequest, NextResponse } from "next/server";
import { searchStockImage } from "@/lib/blog-agent/freepik";

/**
 * Diagnostic endpoint for verifying the Freepik integration end-to-end.
 * Hit /api/blog-agent/test-freepik?q=plumber in the browser. It returns
 * whether the API key is set, the query that was sent, and the result.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "plumber arizona";

  const hasApiKey = !!process.env.FREEPIK_API_KEY;
  if (!hasApiKey) {
    return NextResponse.json({
      ok: false,
      error: "FREEPIK_API_KEY is not set in Vercel environment variables. Add it in Settings → Environment Variables, then redeploy.",
      query: q,
    });
  }

  // Also report the raw first-attempt response so we can debug shape issues.
  let rawSample: unknown = null;
  try {
    const params = new URLSearchParams({
      term: q,
      "filters[content_type][photo]": "1",
      "filters[orientation]": "horizontal",
      limit: "3",
      order: "relevance",
    });
    const res = await fetch(`https://api.freepik.com/v1/resources?${params.toString()}`, {
      headers: {
        "x-freepik-api-key": process.env.FREEPIK_API_KEY!,
        "Accept-Language": "en-US",
      },
    });
    const body = await res.text();
    try {
      rawSample = { status: res.status, body: JSON.parse(body) };
    } catch {
      rawSample = { status: res.status, body: body.slice(0, 500) };
    }
  } catch (err) {
    rawSample = { error: err instanceof Error ? err.message : String(err) };
  }

  const image = await searchStockImage(q);

  return NextResponse.json({
    ok: !!image,
    query: q,
    apiKeyPresent: true,
    parsedImage: image,
    rawFreepikResponse: rawSample,
  });
}
