/**
 * Site context fetcher — pulls the client's homepage HTML and extracts
 * navigational structure so the researcher understands what service/money
 * pages already exist on the site (= internal linking targets).
 *
 * This is what makes the researcher stop suggesting blog posts that try
 * to rank for commercial keywords and instead suggest informational
 * content that supports the existing commercial pages.
 *
 * Returns empty result on failure — research can still proceed.
 */

export interface SiteContext {
  homepageTitle: string;
  metaDescription: string;
  h1: string;
  servicePages: Array<{ url: string; label: string }>;
  /** Raw text excerpt from the homepage (~500 chars) for brand positioning */
  positioning: string;
}

const EMPTY: SiteContext = {
  homepageTitle: "",
  metaDescription: "",
  h1: "",
  servicePages: [],
  positioning: "",
};

export async function fetchSiteContext(websiteUrl: string): Promise<SiteContext> {
  if (!websiteUrl) return EMPTY;

  try {
    const res = await fetch(websiteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MonthlyBlogsAgent/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return EMPTY;

    const html = await res.text();

    return {
      homepageTitle: extractTitle(html),
      metaDescription: extractMetaDescription(html),
      h1: extractH1(html),
      servicePages: extractServiceLinks(html, websiteUrl),
      positioning: extractPositioning(html),
    };
  } catch (err) {
    console.error("[site-context] fetch failed:", err);
    return EMPTY;
  }
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1].trim()) : "";
}

function extractMetaDescription(html: string): string {
  const m = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  );
  return m ? decode(m[1].trim()) : "";
}

function extractH1(html: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? decode(stripTags(m[1])).trim() : "";
}

/**
 * Extract internal nav-ish links. Heuristic: look at anchor tags inside
 * nav/header regions first; fall back to any internal links. De-duplicate
 * by URL, cap at 25 so the prompt doesn't blow up.
 */
function extractServiceLinks(
  html: string,
  baseUrl: string
): Array<{ url: string; label: string }> {
  const origin = safeOrigin(baseUrl);
  if (!origin) return [];

  // Prefer nav/header sections
  const navRegions = [
    ...html.matchAll(/<nav[\s\S]*?<\/nav>/gi),
    ...html.matchAll(/<header[\s\S]*?<\/header>/gi),
  ].map((m) => m[0]);

  const searchIn = navRegions.length > 0 ? navRegions.join("\n") : html;

  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const results: Array<{ url: string; label: string }> = [];

  for (const m of searchIn.matchAll(linkRegex)) {
    const href = m[1];
    const label = decode(stripTags(m[2])).trim();
    if (!label || label.length > 60) continue;

    const absolute = resolveUrl(href, baseUrl);
    if (!absolute) continue;

    // Only same-origin links, skip anchors/queries to same page
    if (!absolute.startsWith(origin)) continue;
    if (absolute === baseUrl || absolute === origin || absolute === `${origin}/`) continue;
    if (/\.(png|jpe?g|gif|svg|webp|pdf|mp4|css|js)(\?|$)/i.test(absolute)) continue;

    const key = absolute.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ url: absolute, label });
    if (results.length >= 25) break;
  }

  return results;
}

function extractPositioning(html: string): string {
  // Strip scripts, styles, and tags; grab first ~500 chars of visible-ish text
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decode(cleaned.slice(0, 600));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
