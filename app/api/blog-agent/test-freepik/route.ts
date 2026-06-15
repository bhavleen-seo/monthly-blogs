import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic endpoint for verifying the Pixabay integration.
 * Hit /api/blog-agent/test-freepik?q=your+query in the browser.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "business professional";

  const apiKey = process.env.PIXABAY_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      stage: "env_check",
      error: "PIXABAY_API_KEY is not set in Vercel environment variables.",
      fix: "Go to Vercel dashboard → your project → Settings → Environment Variables → add PIXABAY_API_KEY with your key from pixabay.com/api/docs, then redeploy.",
    });
  }

  const params = new URLSearchParams({
    key:         apiKey,
    q,
    image_type:  "photo",
    orientation: "horizontal",
    safesearch:  "true",
    order:       "relevance",
    per_page:    "3",
  });

  let httpStatus: number | null = null;
  let rawBody: unknown = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(`https://pixabay.com/api/?${params.toString()}`);
    httpStatus = res.status;
    const text = await res.text();
    try { rawBody = JSON.parse(text); } catch { rawBody = text.slice(0, 500); }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const hits = (rawBody as { hits?: unknown[] })?.hits ?? [];
  const hasResults = Array.isArray(hits) && hits.length > 0;

  let diagnosis = "";
  if (fetchError)                              diagnosis = `Network error: ${fetchError}`;
  else if (httpStatus === 400)                 diagnosis = "Bad request — API key likely invalid.";
  else if (httpStatus === 429)                 diagnosis = "Rate limit hit. Try again in a minute.";
  else if (httpStatus !== 200)                 diagnosis = `Unexpected HTTP ${httpStatus}.`;
  else if (!hasResults)                        diagnosis = `API responded OK but returned 0 results for "${q}".`;
  else                                         diagnosis = `✓ Working! Got ${(hits as unknown[]).length} photo(s) for "${q}".`;

  return NextResponse.json({
    ok: httpStatus === 200 && hasResults,
    query: q,
    apiKeyPresent: true,
    apiKeyPrefix: apiKey.slice(0, 6) + "…",
    httpStatus,
    fetchError,
    diagnosis,
    resultCount: Array.isArray(hits) ? hits.length : 0,
    firstPhotoUrl: hasResults
      ? (hits[0] as { largeImageURL?: string })?.largeImageURL ?? null
      : null,
  });
}
