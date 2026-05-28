/**
 * Freepik stock image search + download + resize.
 *
 * Used by the writer to attach a featured image URL to every new post.
 * Pipeline:
 *   1. Search Freepik for a horizontal photo matching the post's keyword.
 *   2. Call Freepik's download endpoint for the top result to get the
 *      full-resolution original (uses 1 Premium download credit per post).
 *   3. Wrap that URL with images.weserv.nl to resize to 750×500 at JPEG q85,
 *      producing a small, fast-loading version (~100-150KB). weserv caches,
 *      so once fetched it stays available even after Freepik's signed URL
 *      expires.
 *   4. Pre-fetch the wrapped URL (HEAD request) to trigger weserv's cache
 *      before Freepik's signed URL expires.
 *
 * If ANY step fails, we degrade gracefully: full-res fails → use preview
 * URL; weserv fails → use the raw Freepik URL as-is. The post always gets
 * *something*, or nothing and the user pastes manually.
 */

const FREEPIK_API = "https://api.freepik.com/v1/resources";

// Target output dimensions and quality for the resized featured image.
const IMG_W = 1200;
const IMG_H = 800;
const IMG_QUALITY = 90;

export interface FreepikImage {
  /** Direct URL to the image (for upload to WordPress via the publisher) */
  url: string;
  /** Suggested filename when uploading */
  filename: string;
  /** Freepik resource id for logging/debugging */
  freepikId: string | number;
}

interface FreepikResource {
  id?: string | number;
  image?: { source?: { url?: string }; type?: string };
  url?: string;
  preview?: { url?: string };
}

interface FreepikSearchResponse {
  data?: FreepikResource[];
  meta?: unknown;
  message?: string;
}

/**
 * Search Freepik for a horizontal photo matching the query. Tries the primary
 * query first, then a fallback if no results.
 *
 * Returns null on any failure (missing API key, no results, network error).
 */
export async function searchStockImage(
  primaryQuery: string,
  fallbackQuery?: string,
  excludedIds?: Set<string | number>
): Promise<FreepikImage | null> {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) {
    console.warn("[freepik] FREEPIK_API_KEY env var not set — skipping image search");
    return null;
  }

  // Build a cascade of queries from most specific → most generic.
  // This way we always find *something* relevant rather than returning null.
  const queries = buildQueryCascade(primaryQuery, fallbackQuery);

  for (const query of queries) {
    const result = await trySearch(query, apiKey, excludedIds);
    if (result) {
      console.log(`[freepik] Found image with query: "${query}"`);
      return result;
    }
  }

  return null;
}

/**
 * Build a list of queries from most specific to least, so we always have
 * a fallback when Freepik returns no results for a specific term.
 */
function buildQueryCascade(primaryQuery: string, fallbackQuery?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (q: string) => {
    const t = q.trim().replace(/[":?!]/g, "").trim();
    if (t.length > 2 && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  };

  // 1. Full primary query (e.g. "roof lifespan Arizona climate")
  add(primaryQuery);

  // 2. First 4 words of primary (shorter = broader Freepik match)
  const primaryWords = primaryQuery.split(/\s+/);
  if (primaryWords.length > 4) add(primaryWords.slice(0, 4).join(" "));

  // 3. First 2 words of primary (very broad)
  if (primaryWords.length > 2) add(primaryWords.slice(0, 2).join(" "));

  // 4. Fallback query (usually the blog title)
  if (fallbackQuery) add(fallbackQuery);

  // 5. First 4 words of fallback
  if (fallbackQuery) {
    const fw = fallbackQuery.split(/\s+/);
    if (fw.length > 4) add(fw.slice(0, 4).join(" "));
  }

  return out;
}

async function trySearch(query: string, apiKey: string, excludedIds?: Set<string | number>): Promise<FreepikImage | null> {
  try {
    const params = new URLSearchParams();
    params.append("term", query);
    params.append("filters[content_type][photo]", "1");
    params.append("filters[orientation][]", "horizontal");
    params.append("limit", "10");
    params.append("order", "relevance");

    const res = await fetch(`${FREEPIK_API}?${params.toString()}`, {
      headers: {
        "x-freepik-api-key": apiKey,
        "Accept": "application/json",
        "Accept-Language": "en-US",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[freepik] Search "${query}" failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
      return null;
    }

    const data: FreepikSearchResponse = await res.json();
    const items = data.data || [];
    if (items.length === 0) {
      console.warn(`[freepik] No results for query "${query}"`);
      return null;
    }

    // Find the first usable result that hasn't been used for this client before.
    let chosen: { id: string | number; previewUrl: string } | null = null;
    for (const item of items) {
      const id = item?.id ?? "img";
      // Skip images already used by this client in previous posts.
      if (excludedIds && id !== "img" && excludedIds.has(id)) continue;
      const url = item?.image?.source?.url || item?.preview?.url || item?.url;
      if (typeof url === "string" && url.startsWith("http")) {
        chosen = { id, previewUrl: url };
        break;
      }
    }
    if (!chosen) {
      console.warn(`[freepik] No usable image URL in ${items.length} results for "${query}" (${excludedIds?.size ?? 0} excluded)`);
      return null;
    }

    // Try to upgrade to the full-resolution original via the download endpoint.
    // If that fails (e.g. no credits, not Premium, API hiccup), we fall back to
    // the 626x417 preview.
    const fullResUrl = await getDownloadUrl(chosen.id, apiKey);
    const sourceUrl = fullResUrl || chosen.previewUrl;

    // Wrap with weserv.nl to resize to 750x500 at JPEG q85. This gives us
    // a small, fast-loading image without needing sharp + Blob locally.
    const resizedUrl = wrapWithResizer(sourceUrl);

    // Pre-fetch to trigger weserv's cache. If the source is a Freepik signed
    // URL (which expires), this ensures the image is saved in weserv's cache
    // before the signed URL dies. Ignore errors — worst case WP fetches later.
    try {
      await fetch(resizedUrl, { method: "HEAD" });
    } catch { /* cache is best-effort */ }

    return {
      url: resizedUrl,
      filename: `freepik-${chosen.id}.jpg`,
      freepikId: chosen.id,
    };
  } catch (err) {
    console.warn(`[freepik] Network error searching "${query}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Call Freepik's download endpoint for a specific resource. Returns a signed
 * URL to the full-resolution original, or null on any failure.
 *
 * Uses 1 Premium download credit per successful call.
 */
async function getDownloadUrl(resourceId: string | number, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${FREEPIK_API}/${resourceId}/download`, {
      headers: {
        "x-freepik-api-key": apiKey,
        "Accept": "application/json",
        "Accept-Language": "en-US",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[freepik] Download endpoint failed for ${resourceId}: ${res.status} — ${body.slice(0, 200)}`);
      return null;
    }

    const data: { data?: { url?: string; filename?: string } } = await res.json();
    const url = data?.data?.url;
    if (typeof url === "string" && url.startsWith("http")) return url;

    console.warn(`[freepik] Download endpoint returned no URL for ${resourceId}`);
    return null;
  } catch (err) {
    console.warn(`[freepik] Download error for ${resourceId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Wrap a source image URL with images.weserv.nl resize parameters.
 * Produces a 750x500 JPEG at quality 85, cropped to fit.
 *
 * weserv strips the protocol from the source URL by convention, so we pass
 * the host + path form.
 */
function wrapWithResizer(sourceUrl: string): string {
  // weserv expects the url param without the leading scheme for HTTP-style
  // sources (it re-applies HTTPS). We leave the URL intact and URL-encode.
  const encoded = encodeURIComponent(sourceUrl.replace(/^https?:\/\//, ""));
  return `https://images.weserv.nl/?url=${encoded}&w=${IMG_W}&h=${IMG_H}&fit=cover&output=jpg&q=${IMG_QUALITY}`;
}

/**
 * Build short alt text from the writer's featuredImagePrompt. Trims to ~125
 * chars at a word boundary, since that's the sweet spot for SEO and screen
 * readers.
 */
export function buildAltText(featuredImagePrompt: string, primaryKeyword?: string): string {
  let text = (featuredImagePrompt || "").trim();
  if (!text) text = primaryKeyword || "Featured image";

  // Trim opening "Image of" / "Picture of" / "A photo of" — bad alt text style.
  text = text.replace(/^(an?\s+)?(image|photo|picture|illustration)\s+of\s+/i, "");

  if (text.length <= 125) return text;
  const truncated = text.slice(0, 125);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated).trim();
}
