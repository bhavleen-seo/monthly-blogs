import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/blog-agent/posts/extract-image?url=https://www.magnific.com/...
 *
 * Fetches a webpage and extracts the best image URL from it.
 * Tries (in order):
 *   1. og:image meta tag   — used by Magnific, Freepik, Getty, Unsplash, etc.
 *   2. twitter:image meta tag
 *   3. First <img> with a src that looks like a real photo (not icon/logo)
 *
 * Returns { imageUrl, altText, sourceUrl }
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim() || "";
  if (!url) return NextResponse.json({ error: "url param required" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: {
        // Pose as a regular browser so sites don't block us
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Page fetch failed: ${res.status}` }, { status: 502 });
    }

    const html = await res.text();

    // --- og:image (most reliable — stock sites always set this) ---
    const ogImage = extractMeta(html, "og:image") || extractMeta(html, "og:image:url");
    const ogAlt   = extractMeta(html, "og:image:alt") || extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || "";

    if (ogImage) {
      return NextResponse.json({
        imageUrl:  absoluteUrl(ogImage, url),
        altText:   cleanAlt(ogAlt),
        sourceUrl: url,
      });
    }

    // --- twitter:image fallback ---
    const twitterImage = extractMeta(html, "twitter:image") || extractMeta(html, "twitter:image:src");
    const twitterAlt   = extractMeta(html, "twitter:description") || "";
    if (twitterImage) {
      return NextResponse.json({
        imageUrl:  absoluteUrl(twitterImage, url),
        altText:   cleanAlt(twitterAlt),
        sourceUrl: url,
      });
    }

    // --- First large <img> fallback ---
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+\.(jpg|jpeg|png|webp)(?:\?[^"']*)?)["'][^>]*>/i);
    if (imgMatch) {
      return NextResponse.json({
        imageUrl:  absoluteUrl(imgMatch[1], url),
        altText:   "",
        sourceUrl: url,
      });
    }

    return NextResponse.json({ error: "No image found on this page" }, { status: 404 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to fetch page: ${msg}` }, { status: 502 });
  }
}

function extractMeta(html: string, property: string): string {
  // Match both property= and name= variants
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function absoluteUrl(src: string, base: string): string {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function cleanAlt(text: string): string {
  // Decode HTML entities, strip tags, trim
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim()
    .slice(0, 125);
}
