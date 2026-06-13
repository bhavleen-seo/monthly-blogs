/**
 * Freepik stock image search + download + resize.
 *
 * Used by the writer to attach a featured image URL to every new post.
 * Pipeline:
 *   1. Search Freepik for a horizontal photo matching the post's keyword.
 *   2. Call Freepik's download endpoint for the top result to get the
 *      full-resolution original (uses 1 Premium download credit per post).
 *   3. Wrap that URL with images.weserv.nl to resize to 1200×800 at JPEG q90,
 *      producing a clean, fast-loading version. weserv caches the result,
 *      so once fetched it stays available even after Freepik's signed URL
 *      expires.
 *   4. Pre-fetch the wrapped URL (HEAD request) to trigger weserv's cache
 *      before Freepik's signed URL expires.
 *
 * If ANY step fails, we degrade gracefully: full-res fails → use preview
 * URL; weserv fails → use the raw Freepik URL as-is. The post always gets
 * *something*, or nothing and the user pastes manually.
 *
 * API migration note:
 *   Freepik rebranded its developer API as "Magnific". We try the original
 *   api.freepik.com endpoint with x-freepik-api-key first (backward compat),
 *   then fall back to api.magnific.com with x-magnific-api-key if needed.
 *   Both use the same FREEPIK_API_KEY environment variable.
 */

const FREEPIK_API  = "https://api.freepik.com/v1/resources";
const MAGNIFIC_API = "https://api.magnific.com/v1/resources";

// Target output dimensions and quality for the resized featured image.
const IMG_W       = 1200;
const IMG_H       = 800;
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
 * Search Freepik for a stock photo.
 *
 * @param primaryQuery   The most specific query (e.g. the post's featuredImagePrompt)
 * @param fallbackQuery  Secondary query (e.g. the blog title)
 * @param excludedIds    Freepik IDs to skip (already used by this client)
 * @param visualHints    Short visual terms to try first (e.g. ["business uniforms", "workwear"])
 */
export async function searchStockImage(
  primaryQuery: string,
  fallbackQuery?: string,
  excludedIds?: Set<string | number>,
  visualHints?: string[]
): Promise<FreepikImage | null> {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) {
    console.warn("[freepik] FREEPIK_API_KEY env var not set — skipping image search");
    return null;
  }

  const queries = buildQueryCascade(primaryQuery, fallbackQuery, visualHints);

  for (const query of queries) {
    const result = await trySearch(query, apiKey, excludedIds);
    if (result) {
      console.log(`[freepik] Found image with query: "${query}"`);
      return result;
    }
  }

  console.warn("[freepik] All queries exhausted — no image found");
  return null;
}

/**
 * Strip common photo-description prefixes so we're left with the visual subject.
 * "Professional photograph of a business owner in an office" → "business owner in an office"
 */
function stripPhotoPrefix(q: string): string {
  return q
    .replace(/^(professional\s+)?(photograph|photo|image|picture|illustration|rendering)\s+(of|showing|depicting|featuring)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
}

// Common English words that make poor image search terms on their own.
const STOP_WORDS = new Set([
  "how", "why", "what", "when", "where", "who", "which",
  "will", "can", "does", "did", "do", "don't", "doesn't", "didn't",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "the", "a", "an", "for", "to", "of", "in", "on", "at", "by", "with",
  "that", "this", "these", "those", "than", "then", "from", "into", "about",
  "and", "or", "but", "not", "nor",
  "you", "your", "we", "our", "they", "their", "its", "my", "me", "us",
  "i", "he", "she", "it", "him", "her", "them",
  "eliminates", "helps", "makes", "gives", "gets", "needs", "need", "want",
  "using", "use", "know", "keep", "find", "avoid", "choose", "should", "must",
  "best", "top", "guide", "tips", "ways", "steps", "checklist", "signs",
  "things", "reasons", "mistakes", "questions", "answers", "facts",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
]);

/**
 * Extract meaningful 2-word pairs from text by sliding a window and skipping
 * stop words. e.g. "How Body Donation Eliminates Funeral Costs" →
 * ["body donation", "funeral costs"].
 */
function extractNounPairs(text: string): string[] {
  const words = text.replace(/[":?!,]/g, "").split(/\s+/).filter(Boolean);
  const pairs: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].toLowerCase();
    const w2 = words[i + 1].toLowerCase();
    if (!STOP_WORDS.has(w1) && !STOP_WORDS.has(w2) && w1.length > 2 && w2.length > 2) {
      pairs.push(`${words[i]} ${words[i + 1]}`);
    }
  }
  return pairs;
}

/**
 * Build a cascade of queries from most specific → most visual/generic.
 * Good Freepik queries are short concrete nouns (2-4 words), not full sentences.
 *
 * Order of priority:
 *  1. Noun pairs from blog title  — most content-specific signal we have
 *  2. Client visual hints         — industry-specific keywords
 *  3. featuredImagePrompt         — short if AI followed instructions, long = truncated
 *  4. Single key noun from title  — last content-specific attempt
 *  5. Generic safety net
 */
function buildQueryCascade(
  primaryQuery: string,
  fallbackQuery?: string,
  visualHints?: string[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (q: string) => {
    const t = stripPhotoPrefix(q).replace(/[":?!,]/g, "").trim();
    if (t.length > 2 && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  };

  // 1. Noun pairs from the blog title
  const titleSource = fallbackQuery || primaryQuery;
  const titlePairs = extractNounPairs(titleSource);
  for (const pair of titlePairs.slice(0, 4)) add(pair);

  // 2. Client visual hints (e.g. ["pest control", "exterminator service"])
  for (const hint of visualHints || []) add(hint);

  // 3. The featuredImagePrompt — short phrase preferred; truncate if long
  const strippedPrimary = stripPhotoPrefix(primaryQuery).replace(/[":?!,]/g, "").trim();
  const primaryWords = strippedPrimary.split(/\s+/).filter(Boolean);
  if (primaryWords.length <= 4) {
    add(strippedPrimary);
  } else {
    const meaningful = primaryWords.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length > 2);
    if (meaningful.length >= 2) add(meaningful.slice(0, 3).join(" "));
    if (meaningful.length >= 2) add(meaningful.slice(0, 2).join(" "));
  }

  // 4. First meaningful single noun from the blog title
  const titleWords = titleSource.replace(/[":?!,]/g, "").split(/\s+/);
  for (const w of titleWords) {
    if (!STOP_WORDS.has(w.toLowerCase()) && w.length > 4) {
      add(w);
      break;
    }
  }

  // 5. Generic safety-net queries — always return results on Freepik
  for (const safe of ["business professional", "office workplace", "small business"]) {
    add(safe);
  }

  return out;
}

/**
 * Try the search with a given API base URL and auth header name.
 * Returns the first usable image, or null on failure.
 */
async function trySearchVariant(
  query: string,
  apiKey: string,
  baseUrl: string,
  headerName: string,
  excludedIds?: Set<string | number>
): Promise<FreepikImage | null> {
  try {
    const params = new URLSearchParams();
    params.append("term", query);
    params.append("filters[content_type][photo]", "1");
    params.append("filters[orientation][]", "horizontal");
    params.append("limit", "10");
    params.append("order", "relevance");

    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        [headerName]: apiKey,
        "Accept": "application/json",
        "Accept-Language": "en-US",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[freepik] ${headerName} search "${query}" → ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data: FreepikSearchResponse = await res.json();
    const items = data.data || [];
    if (items.length === 0) {
      console.warn(`[freepik] No results for query "${query}"`);
      return null;
    }

    let chosen: { id: string | number; previewUrl: string } | null = null;
    for (const item of items) {
      const id = item?.id ?? "img";
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

    // Try to get full-res download URL (uses 1 credit); fall back to preview
    const fullResUrl = await getDownloadUrl(chosen.id, apiKey, baseUrl, headerName);
    const sourceUrl  = fullResUrl || chosen.previewUrl;
    const resizedUrl = wrapWithResizer(sourceUrl);

    // Warm weserv's cache before Freepik's signed URL expires
    try { await fetch(resizedUrl, { method: "HEAD" }); } catch { /* best-effort */ }

    return {
      url: resizedUrl,
      filename: `freepik-${chosen.id}.jpg`,
      freepikId: chosen.id,
    };
  } catch (err) {
    console.warn(`[freepik] Network error for "${query}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Try the search using original Freepik header first, then Magnific header as fallback.
 */
async function trySearch(
  query: string,
  apiKey: string,
  excludedIds?: Set<string | number>
): Promise<FreepikImage | null> {
  // Try original Freepik endpoint first (backward compatible)
  const freepikResult = await trySearchVariant(query, apiKey, FREEPIK_API, "x-freepik-api-key", excludedIds);
  if (freepikResult) return freepikResult;

  // If that returned nothing (e.g. 401 due to API migration), try Magnific endpoint
  const magResult = await trySearchVariant(query, apiKey, MAGNIFIC_API, "x-magnific-api-key", excludedIds);
  return magResult;
}

/**
 * Call Freepik's download endpoint for a specific resource. Returns a signed
 * URL to the full-resolution original, or null on any failure.
 * Uses 1 Premium download credit per successful call.
 */
async function getDownloadUrl(
  resourceId: string | number,
  apiKey: string,
  baseUrl: string,
  headerName: string
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/${resourceId}/download`, {
      headers: {
        [headerName]: apiKey,
        "Accept": "application/json",
        "Accept-Language": "en-US",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[freepik] Download failed for ${resourceId}: ${res.status} — ${body.slice(0, 200)}`);
      return null;
    }

    const data: { data?: { url?: string } } = await res.json();
    const url = data?.data?.url;
    if (typeof url === "string" && url.startsWith("http")) return url;

    console.warn(`[freepik] Download returned no URL for ${resourceId}`);
    return null;
  } catch (err) {
    console.warn(`[freepik] Download error for ${resourceId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Wrap a source image URL with images.weserv.nl resize parameters.
 * Produces a 1200×800 JPEG at quality 90, cropped to fit.
 */
function wrapWithResizer(sourceUrl: string): string {
  const encoded = encodeURIComponent(sourceUrl.replace(/^https?:\/\//, ""));
  return `https://images.weserv.nl/?url=${encoded}&w=${IMG_W}&h=${IMG_H}&fit=cover&output=jpg&q=${IMG_QUALITY}`;
}

/**
 * Build short alt text from the writer's featuredImagePrompt. Trims to ~125
 * chars at a word boundary, since that's the sweet spot for SEO and screen readers.
 */
export function buildAltText(featuredImagePrompt: string, primaryKeyword?: string): string {
  let text = (featuredImagePrompt || "").trim();
  if (!text) text = primaryKeyword || "Featured image";

  text = text.replace(/^(an?\s+)?(image|photo|picture|illustration)\s+of\s+/i, "");

  if (text.length <= 125) return text;
  const truncated = text.slice(0, 125);
  const lastSpace  = truncated.lastIndexOf(" ");
  return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated).trim();
}
