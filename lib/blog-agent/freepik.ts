/**
 * Pexels stock image search.
 *
 * Replaces the former Freepik integration. Pexels is completely free
 * (20,000 requests/month, no credits, no paid plan required).
 *
 * Pipeline:
 *   1. Build a cascade of queries from most specific → most generic.
 *   2. Try each query against the Pexels search API until one returns
 *      a usable landscape photo that hasn't been used for this client before.
 *   3. Return the large2x CDN URL (1880px wide) directly — no resizing proxy
 *      needed since Pexels already serves optimised CDN images.
 *
 * Exported function signatures are identical to the old Freepik module so
 * writer.ts and the backfill route need no changes.
 */

const PEXELS_API = "https://api.pexels.com/v1/search";

export interface FreepikImage {
  /** Direct CDN URL to the image (for upload to WordPress via the publisher) */
  url: string;
  /** Suggested filename when uploading */
  filename: string;
  /** Pexels photo id — stored in the freepikId field for backward compatibility */
  freepikId: string | number;
}

interface PexelsPhoto {
  id: number;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    landscape: string;
  };
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[];
  total_results?: number;
  error?: string;
}

/**
 * Search Pexels for a landscape stock photo matching the query cascade.
 *
 * @param primaryQuery   The most specific query (e.g. the post's featuredImagePrompt)
 * @param fallbackQuery  Secondary query (e.g. the blog title)
 * @param excludedIds    Pexels photo IDs to skip (already used by this client)
 * @param visualHints    Short visual terms to try first (e.g. ["business uniforms", "workwear"])
 */
export async function searchStockImage(
  primaryQuery: string,
  fallbackQuery?: string,
  excludedIds?: Set<string | number>,
  visualHints?: string[]
): Promise<FreepikImage | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn("[pexels] PEXELS_API_KEY env var not set — skipping image search");
    return null;
  }

  const queries = buildQueryCascade(primaryQuery, fallbackQuery, visualHints);

  for (const query of queries) {
    const result = await trySearch(query, apiKey, excludedIds);
    if (result) {
      console.log(`[pexels] Found image with query: "${query}"`);
      return result;
    }
  }

  console.warn("[pexels] All queries exhausted — no image found");
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
  // question words
  "how", "why", "what", "when", "where", "who", "which",
  // auxiliaries / linking verbs
  "will", "can", "does", "did", "do", "don't", "doesn't", "didn't",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  // articles / prepositions / conjunctions
  "the", "a", "an", "for", "to", "of", "in", "on", "at", "by", "with",
  "that", "this", "these", "those", "than", "then", "from", "into", "about",
  "and", "or", "but", "not", "nor",
  // pronouns
  "you", "your", "we", "our", "they", "their", "its", "my", "me", "us",
  "i", "he", "she", "it", "him", "her", "them",
  // common verbs that don't translate to visual subjects
  "eliminates", "helps", "makes", "gives", "gets", "needs", "need", "want",
  "using", "use", "know", "keep", "find", "avoid", "choose", "should", "must",
  // SEO boilerplate
  "best", "top", "guide", "tips", "ways", "steps", "checklist", "signs",
  "things", "reasons", "mistakes", "questions", "answers", "facts",
  // numbers written out
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
 * Good Pexels queries are short concrete nouns (2-4 words), not full sentences.
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

  // 1. Noun pairs from the blog title — e.g. "body donation", "funeral costs",
  //    "pest control", "collision repair". Blog titles are written with the
  //    primary keyword in mind so these pairs are the most on-topic signal.
  const titleSource = fallbackQuery || primaryQuery;
  const titlePairs = extractNounPairs(titleSource);
  for (const pair of titlePairs.slice(0, 4)) add(pair);

  // 2. Client visual hints (e.g. ["pest control", "exterminator service"]).
  //    These are industry-level but still more specific than generic fallbacks.
  for (const hint of visualHints || []) add(hint);

  // 3. The featuredImagePrompt — after the writer-prompt fix this should be a
  //    short 2-4 word phrase. If it's still long, we truncate to 3 words.
  const strippedPrimary = stripPhotoPrefix(primaryQuery).replace(/[":?!,]/g, "").trim();
  const primaryWords = strippedPrimary.split(/\s+/).filter(Boolean);
  if (primaryWords.length <= 4) {
    // Short enough to use as-is — this is the ideal case after the prompt fix.
    add(strippedPrimary);
  } else {
    // Long sentence (old posts / legacy prompts) — extract first 3 non-stop words.
    const meaningful = primaryWords.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length > 2);
    if (meaningful.length >= 2) add(meaningful.slice(0, 3).join(" "));
    if (meaningful.length >= 2) add(meaningful.slice(0, 2).join(" "));
  }

  // 4. First meaningful single noun from the blog title — catches cases where
  //    the title is like "Signs You Need an Exterminator" → "Exterminator".
  const titleWords = titleSource.replace(/[":?!,]/g, "").split(/\s+/);
  for (const w of titleWords) {
    if (!STOP_WORDS.has(w.toLowerCase()) && w.length > 4) {
      add(w);
      break;
    }
  }

  // 5. Last-resort safety net — very broad but more neutral than "business professional".
  for (const safe of ["family", "community", "people"]) {
    add(safe);
  }

  return out;
}

async function trySearch(
  query: string,
  apiKey: string,
  excludedIds?: Set<string | number>
): Promise<FreepikImage | null> {
  try {
    const params = new URLSearchParams();
    params.append("query", query);
    params.append("orientation", "landscape");
    params.append("per_page", "10");
    params.append("size", "large");

    const res = await fetch(`${PEXELS_API}?${params.toString()}`, {
      headers: {
        Authorization: apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[pexels] Search "${query}" failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
      return null;
    }

    const data: PexelsSearchResponse = await res.json();
    const photos = data.photos || [];

    if (photos.length === 0) {
      console.warn(`[pexels] No results for query "${query}"`);
      return null;
    }

    // Find first photo not already used by this client.
    let chosen: PexelsPhoto | null = null;
    for (const photo of photos) {
      if (excludedIds && excludedIds.has(photo.id)) continue;
      chosen = photo;
      break;
    }

    if (!chosen) {
      console.warn(`[pexels] All ${photos.length} results excluded for "${query}" (${excludedIds?.size ?? 0} excluded)`);
      return null;
    }

    // large2x is 1880px wide — ideal for WordPress featured images.
    // Fall back through sizes if a smaller variant is all that's available.
    const url = chosen.src.large2x || chosen.src.large || chosen.src.landscape || chosen.src.original;

    return {
      url,
      filename: `pexels-${chosen.id}.jpg`,
      freepikId: chosen.id, // stored in existing freepikId field for backward compat
    };
  } catch (err) {
    console.warn(`[pexels] Network error searching "${query}":`, err instanceof Error ? err.message : err);
    return null;
  }
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
