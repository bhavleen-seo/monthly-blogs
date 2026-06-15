/**
 * Pixabay stock image search.
 *
 * Completely free API (no approval, no per-image cost, no credits).
 * Larger library than Pexels (6M+ photos + illustrations), better coverage
 * for niche trades/local-service industries.
 *
 * Pipeline:
 *   1. Build a cascade of queries from most specific → most generic.
 *   2. Try each query against the Pixabay API until one returns a usable
 *      landscape photo not already used for this client.
 *   3. Return largeImageURL (1280px wide) directly — no resize proxy needed.
 *
 * Exported function signatures are identical to the old Freepik/Pexels modules
 * so writer.ts and the backfill route need no changes.
 */

const PIXABAY_API = "https://pixabay.com/api/";

export interface FreepikImage {
  /** Direct CDN URL to the image */
  url: string;
  /** Suggested filename when uploading to WordPress */
  filename: string;
  /** Pixabay photo id — stored in freepikId field for backward compatibility */
  freepikId: string | number;
}

interface PixabayHit {
  id: number;
  tags: string;
  largeImageURL: string;
  webformatURL: string;
  imageWidth: number;
  imageHeight: number;
}

interface PixabayResponse {
  totalHits?: number;
  hits?: PixabayHit[];
  error?: string;
}

/**
 * Search Pixabay for a landscape stock photo matching the query cascade.
 *
 * @param primaryQuery   The most specific query (e.g. the post's featuredImagePrompt)
 * @param fallbackQuery  Secondary query (e.g. the blog title)
 * @param excludedIds    Pixabay photo IDs to skip (already used by this client)
 * @param visualHints    Short visual terms to try first (e.g. ["pest control", "exterminator"])
 */
export async function searchStockImage(
  primaryQuery: string,
  fallbackQuery?: string,
  excludedIds?: Set<string | number>,
  visualHints?: string[]
): Promise<FreepikImage | null> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn("[pixabay] PIXABAY_API_KEY env var not set — skipping image search");
    return null;
  }

  const queries = buildQueryCascade(primaryQuery, fallbackQuery, visualHints);

  for (const query of queries) {
    const result = await trySearch(query, apiKey, excludedIds);
    if (result) {
      console.log(`[pixabay] Found image with query: "${query}"`);
      return result;
    }
  }

  console.warn("[pixabay] All queries exhausted — no image found");
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
 * Good Pixabay queries are short concrete nouns (2-4 words), not full sentences.
 *
 * Order:
 *  1. Noun pairs from blog title  — most content-specific signal
 *  2. Client visual hints         — industry-specific keywords
 *  3. featuredImagePrompt         — short if AI followed instructions
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

  // 1. Noun pairs from blog title
  const titleSource = fallbackQuery || primaryQuery;
  for (const pair of extractNounPairs(titleSource).slice(0, 4)) add(pair);

  // 2. Client visual hints
  for (const hint of visualHints || []) add(hint);

  // 3. featuredImagePrompt (short phrase preferred)
  const strippedPrimary = stripPhotoPrefix(primaryQuery).replace(/[":?!,]/g, "").trim();
  const primaryWords    = strippedPrimary.split(/\s+/).filter(Boolean);
  if (primaryWords.length <= 4) {
    add(strippedPrimary);
  } else {
    const meaningful = primaryWords.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length > 2);
    if (meaningful.length >= 2) add(meaningful.slice(0, 3).join(" "));
    if (meaningful.length >= 2) add(meaningful.slice(0, 2).join(" "));
  }

  // 4. First meaningful noun from blog title
  for (const w of titleSource.replace(/[":?!,]/g, "").split(/\s+/)) {
    if (!STOP_WORDS.has(w.toLowerCase()) && w.length > 4) { add(w); break; }
  }

  // 5. Generic safety net
  for (const safe of ["business professional", "office workplace", "small business"]) add(safe);

  return out;
}

async function trySearch(
  query: string,
  apiKey: string,
  excludedIds?: Set<string | number>
): Promise<FreepikImage | null> {
  try {
    const params = new URLSearchParams({
      key:          apiKey,
      q:            query,
      image_type:   "photo",
      orientation:  "horizontal",
      safesearch:   "true",
      order:        "relevance",
      per_page:     "10",
    });

    const res = await fetch(`${PIXABAY_API}?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[pixabay] Search "${query}" failed: ${res.status} — ${body.slice(0, 200)}`);
      return null;
    }

    const data: PixabayResponse = await res.json();
    const hits = data.hits || [];

    if (hits.length === 0) {
      console.warn(`[pixabay] No results for query "${query}"`);
      return null;
    }

    // Find first photo not already used by this client.
    let chosen: PixabayHit | null = null;
    for (const hit of hits) {
      if (excludedIds && excludedIds.has(hit.id)) continue;
      chosen = hit;
      break;
    }

    if (!chosen) {
      console.warn(`[pixabay] All ${hits.length} results excluded for "${query}"`);
      return null;
    }

    // largeImageURL is 1280px wide — good quality for WordPress featured images.
    // Fall back to webformatURL (640px) if large isn't available.
    const url = chosen.largeImageURL || chosen.webformatURL;

    return {
      url,
      filename: `pixabay-${chosen.id}.jpg`,
      freepikId: chosen.id,
    };
  } catch (err) {
    console.warn(`[pixabay] Network error for "${query}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Build short alt text from the writer's featuredImagePrompt. Trims to ~125
 * chars at a word boundary — the sweet spot for SEO and screen readers.
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
