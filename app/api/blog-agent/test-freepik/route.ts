import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic endpoint for verifying the Pexels integration end-to-end.
 * Hit /api/blog-agent/test-freepik?q=your+query in the browser.
 * Returns the raw Pexels API status + result so we can see exactly what's
 * happening without digging through Vercel logs.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "business professional";

  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      stage: "env_check",
      error: "PEXELS_API_KEY is not set in Vercel environment variables.",
      fix: "Go to Vercel dashboard → your project → Settings → Environment Variables. Add PEXELS_API_KEY with your key from pexels.com/api, then redeploy.",
    });
  }

  const params = new URLSearchParams();
  params.append("query", q);
  params.append("orientation", "landscape");
  params.append("per_page", "3");
  params.append("size", "large");

  let httpStatus: number | null = null;
  let rawBody: unknown = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: apiKey },
    });
    httpStatus = res.status;
    const text = await res.text();
    try { rawBody = JSON.parse(text); } catch { rawBody = text.slice(0, 500); }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const photos = (rawBody as { photos?: unknown[] })?.photos ?? [];
  const hasResults = Array.isArray(photos) && photos.length > 0;

  let diagnosis = "";
  if (fetchError) diagnosis = "Network error reaching Pexels API.";
  else if (httpStatus === 401 || httpStatus === 403) diagnosis = "Pexels API key is invalid. Double-check the key at pexels.com/api.";
  else if (httpStatus === 429) diagnosis = "Pexels rate limit hit. Wait a minute and try again.";
  else if (httpStatus !== 200) diagnosis = `Unexpected HTTP ${httpStatus} from Pexels.`;
  else if (!hasResults) diagnosis = `API call succeeded but returned 0 photos for "${q}".`;
  else diagnosis = `✓ Working! Got ${(photos as unknown[]).length} photo(s) for "${q}".`;

  return NextResponse.json({
    ok: httpStatus === 200 && hasResults,
    query: q,
    apiKeyPresent: true,
    apiKeyPrefix: apiKey.slice(0, 8) + "…",
    httpStatus,
    fetchError,
    diagnosis,
    resultCount: Array.isArray(photos) ? photos.length : 0,
    firstPhotoUrl: hasResults ? (photos[0] as { src?: { large2x?: string } })?.src?.large2x : null,
    rawPexelsResponse: rawBody,
  });
}
