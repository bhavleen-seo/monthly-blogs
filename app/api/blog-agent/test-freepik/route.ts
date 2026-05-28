import { NextRequest, NextResponse } from "next/server";

const FREEPIK_API = "https://api.freepik.com/v1/resources";

/**
 * Diagnostic endpoint for verifying the Freepik integration end-to-end.
 * Hit /api/blog-agent/test-freepik in the browser (or add ?q=your+query).
 * Returns the raw Freepik API status + body so we can see exactly what's
 * failing without having to dig through Vercel logs.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "business professional";

  const apiKey = process.env.FREEPIK_API_KEY;

  // --- 1. Check env var ---
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      stage: "env_check",
      error: "FREEPIK_API_KEY is not set in Vercel environment variables.",
      fix: "Go to Vercel dashboard → your project → Settings → Environment Variables. Add FREEPIK_API_KEY with your key, then redeploy.",
    });
  }

  // --- 2. Raw API call so we can see exactly what Freepik returns ---
  const params = new URLSearchParams();
  params.append("term", q);
  params.append("filters[content_type][photo]", "1");
  params.append("filters[orientation][]", "horizontal");
  params.append("limit", "3");
  params.append("order", "relevance");

  let httpStatus: number | null = null;
  let rawBody: unknown = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(`${FREEPIK_API}?${params.toString()}`, {
      headers: {
        "x-freepik-api-key": apiKey,
        "Accept": "application/json",
        "Accept-Language": "en-US",
      },
    });
    httpStatus = res.status;
    const text = await res.text();
    try {
      rawBody = JSON.parse(text);
    } catch {
      rawBody = text.slice(0, 1000);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  // --- 3. Interpret the result ---
  const items = (rawBody as { data?: unknown[] })?.data ?? [];
  const hasResults = Array.isArray(items) && items.length > 0;

  let diagnosis = "";
  if (fetchError) {
    diagnosis = "Network error reaching Freepik API. Check Vercel's outbound network settings.";
  } else if (httpStatus === 401 || httpStatus === 403) {
    diagnosis = "Freepik API key is invalid or expired. Generate a new key at freepik.com/api.";
  } else if (httpStatus === 429) {
    diagnosis = "Freepik rate limit hit. Wait a minute and try again.";
  } else if (httpStatus === 402) {
    diagnosis = "Freepik account has no remaining API credits.";
  } else if (httpStatus !== 200) {
    diagnosis = `Unexpected HTTP ${httpStatus} from Freepik.`;
  } else if (!hasResults) {
    diagnosis = `API call succeeded but returned 0 results for query "${q}". Try a different query.`;
  } else {
    diagnosis = `API call succeeded! Got ${(items as unknown[]).length} result(s) for query "${q}".`;
  }

  return NextResponse.json({
    ok: httpStatus === 200 && hasResults,
    query: q,
    apiKeyPresent: true,
    apiKeyPrefix: apiKey.slice(0, 8) + "…",
    httpStatus,
    fetchError,
    diagnosis,
    resultCount: Array.isArray(items) ? items.length : 0,
    rawFreepikResponse: rawBody,
  });
}
