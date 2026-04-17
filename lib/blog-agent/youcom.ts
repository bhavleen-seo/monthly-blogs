/**
 * You.com Contents API client.
 *
 * Fetches clean markdown content from any webpage. Used to pull the top
 * ranking SERP pages before writing, so the writer has real competitor
 * context — not just search snippets.
 *
 * Set YOUCOM_API_KEY in environment to enable. If unset or the API fails,
 * callers should fall back to snippet-only context (lower quality).
 *
 * Docs: https://docs.you.com/api-reference/contents.mdx
 * Endpoint: POST https://ydc-index.io/v1/contents
 * Auth: X-API-Key header
 * Pricing: $1 per 1,000 pages ($100 free credit on signup)
 */

const ENDPOINT = "https://ydc-index.io/v1/contents";

export interface YouComPageContent {
  url: string;
  title: string;
  markdown?: string | null;
  html?: string | null;
  metadata?: {
    site_name?: string | null;
    favicon_url?: string;
  };
}

interface FetchOptions {
  /** Formats to return. Default: ["markdown"] */
  formats?: Array<"markdown" | "html" | "metadata">;
  /** Per-URL crawl timeout in seconds (1-60). Default 10. */
  crawlTimeout?: number;
}

/**
 * Trim a fetched page's markdown to a compact excerpt suitable for an LLM prompt.
 * Returns a formatted block with title, URL, and a truncated body.
 */
export function formatPageForPrompt(
  page: YouComPageContent,
  maxChars = 1200
): string {
  const md = (page.markdown || "").trim();
  const truncated = md.length > maxChars ? md.slice(0, maxChars) + "…" : md;
  return `**${page.title || page.url}** (${page.url})\n${truncated}`;
}

/**
 * Fetch clean content from one or more URLs in a single batched request.
 * Returns [] on failure so callers can gracefully degrade.
 */
export async function fetchPageContents(
  urls: string[],
  opts: FetchOptions = {}
): Promise<YouComPageContent[]> {
  const apiKey = process.env.YOUCOM_API_KEY;
  if (!apiKey) {
    console.warn("[youcom] YOUCOM_API_KEY not set — skipping content fetch");
    return [];
  }
  if (urls.length === 0) return [];

  const formats = opts.formats ?? ["markdown"];
  const crawl_timeout = opts.crawlTimeout ?? 10;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls, formats, crawl_timeout }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[youcom] Contents API ${res.status}: ${errText.slice(0, 300)}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? (data as YouComPageContent[]) : [];
  } catch (err) {
    console.error("[youcom] fetchPageContents failed:", err);
    return [];
  }
}
