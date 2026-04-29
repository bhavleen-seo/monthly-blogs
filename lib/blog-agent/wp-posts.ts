/**
 * Fetch recent published posts from a client's WordPress site so the writer
 * can use them as real internal-link targets instead of inventing URLs.
 *
 * Uses the public WP REST API — no auth needed for published posts. Returns
 * an empty list on any failure (blocked plugin, non-WP site, network error).
 */

export interface RecentPost {
  url: string;
  title: string;
}

export async function fetchRecentPosts(
  wordpressUrl: string,
  limit = 20
): Promise<RecentPost[]> {
  if (!wordpressUrl) return [];

  const base = wordpressUrl.replace(/\/$/, "");
  const endpoint = `${base}/wp-json/wp/v2/posts?per_page=${limit}&_fields=link,title&orderby=date&order=desc`;

  try {
    const res = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MonthlyBlogsAgent/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((p: any) => ({
        url: typeof p?.link === "string" ? p.link : "",
        title:
          typeof p?.title?.rendered === "string"
            ? decodeHtmlEntities(p.title.rendered).trim()
            : "",
      }))
      .filter((p) => p.url && p.title);
  } catch (err) {
    console.error("[wp-posts] fetch failed:", err);
    return [];
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, ",")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;/g, " ");
}
