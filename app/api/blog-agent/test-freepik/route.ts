import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic endpoint for verifying the Freepik/Magnific integration.
 * Hit /api/blog-agent/test-freepik?q=your+query in the browser.
 *
 * Tests both the original api.freepik.com endpoint (x-freepik-api-key) and
 * the new api.magnific.com endpoint (x-magnific-api-key) using the same
 * FREEPIK_API_KEY env var, so you can see exactly which one is active.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "business professional";

  const apiKey = process.env.FREEPIK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      stage: "env_check",
      error: "FREEPIK_API_KEY is not set in Vercel environment variables.",
      fix: "Go to Vercel dashboard → your project → Settings → Environment Variables → add FREEPIK_API_KEY, then redeploy.",
    });
  }

  const params = new URLSearchParams();
  params.append("term", q);
  params.append("filters[content_type][photo]", "1");
  params.append("filters[orientation][]", "horizontal");
  params.append("limit", "3");
  params.append("order", "relevance");

  // Test both variants so we know which one the key works with
  async function testVariant(baseUrl: string, headerName: string) {
    let httpStatus: number | null = null;
    let rawBody: unknown = null;
    let fetchError: string | null = null;

    try {
      const res = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: {
          [headerName]: apiKey!,
          "Accept": "application/json",
          "Accept-Language": "en-US",
        },
      });
      httpStatus = res.status;
      const text = await res.text();
      try { rawBody = JSON.parse(text); } catch { rawBody = text.slice(0, 500); }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }

    const items = (rawBody as { data?: unknown[] })?.data ?? [];
    const hasResults = Array.isArray(items) && items.length > 0;

    let diagnosis = "";
    if (fetchError)                              diagnosis = `Network error: ${fetchError}`;
    else if (httpStatus === 401 || httpStatus === 403) diagnosis = "API key rejected (401/403) — key invalid or wrong plan for this endpoint.";
    else if (httpStatus === 429)                 diagnosis = "Rate limit hit. Wait a minute and try again.";
    else if (httpStatus !== 200)                 diagnosis = `Unexpected HTTP ${httpStatus}.`;
    else if (!hasResults)                        diagnosis = `API responded OK but returned 0 results for "${q}".`;
    else                                         diagnosis = `✓ Working! Got ${(items as unknown[]).length} result(s) for "${q}".`;

    return {
      ok: httpStatus === 200 && hasResults,
      endpoint: baseUrl,
      header: headerName,
      httpStatus,
      fetchError,
      diagnosis,
      resultCount: Array.isArray(items) ? items.length : 0,
      firstPreviewUrl: hasResults
        ? ((items[0] as { preview?: { url?: string }; image?: { source?: { url?: string } } })?.image?.source?.url
          || (items[0] as { preview?: { url?: string } })?.preview?.url
          || null)
        : null,
    };
  }

  const [freepikResult, magResult] = await Promise.all([
    testVariant("https://api.freepik.com/v1/resources", "x-freepik-api-key"),
    testVariant("https://api.magnific.com/v1/resources", "x-magnific-api-key"),
  ]);

  const workingVariant = freepikResult.ok ? "freepik" : magResult.ok ? "magnific" : "none";

  return NextResponse.json({
    ok: workingVariant !== "none",
    query: q,
    apiKeyPresent: true,
    apiKeyPrefix: apiKey.slice(0, 8) + "…",
    workingVariant,
    summary: workingVariant === "freepik"
      ? "✓ Original Freepik API (api.freepik.com / x-freepik-api-key) is working."
      : workingVariant === "magnific"
        ? "✓ Magnific API (api.magnific.com / x-magnific-api-key) is working."
        : "✗ Neither endpoint returned results. Check the details below.",
    freepik: freepikResult,
    magnific: magResult,
  });
}
