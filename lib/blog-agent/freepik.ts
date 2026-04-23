/**
 * Freepik stock image search.
 *
 * Used by the writer to attach a featured image URL to every new post.
 * Failures NEVER throw — image lookup must not block content generation. If
 * Freepik returns nothing or errors out, the post is saved without a
 * featuredImageUrl and the user can paste one manually in the preview modal.
 */

const FREEPIK_API = "https://api.freepik.com/v1/resources";

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
  fallbackQuery?: string
): Promise<FreepikImage | null> {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) {
    console.warn("[freepik] FREEPIK_API_KEY env var not set — skipping image search");
    return null;
  }

  for (const query of [primaryQuery, fallbackQuery].filter((q): q is string => !!q && q.trim().length > 0)) {
    const result = await trySearch(query.trim(), apiKey);
    if (result) return result;
  }

  return null;
}

async function trySearch(query: string, apiKey: string): Promise<FreepikImage | null> {
  try {
    const params = new URLSearchParams({
      term: query,
      "filters[content_type][photo]": "1",
      "filters[orientation]": "horizontal",
      limit: "10",
      order: "relevance",
    });

    const res = await fetch(`${FREEPIK_API}?${params.toString()}`, {
      headers: {
        "x-freepik-api-key": apiKey,
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

    // Find first item with a usable URL. Different API tiers/versions return
    // slightly different shapes — read defensively.
    for (const item of items) {
      const url = item?.image?.source?.url || item?.preview?.url || item?.url;
      if (typeof url === "string" && url.startsWith("http")) {
        const id = item?.id ?? "img";
        return {
          url,
          filename: `freepik-${id}.jpg`,
          freepikId: id,
        };
      }
    }

    console.warn(`[freepik] No usable image URL in ${items.length} results for "${query}"`);
    return null;
  } catch (err) {
    console.warn(`[freepik] Network error searching "${query}":`, err instanceof Error ? err.message : err);
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
