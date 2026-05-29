import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/blog-agent/posts/image-search?q=dumpster+rental+truck
 *
 * Searches Pexels and returns up to 9 landscape photos so the user can
 * pick one manually from the preview modal.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ photos: [] });

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PEXELS_API_KEY not set" }, { status: 500 });
  }

  const params = new URLSearchParams({
    query: q,
    orientation: "landscape",
    per_page: "9",
    size: "large",
  });

  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Pexels error: ${res.status} — ${body.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  const photos = (data.photos || []).map((p: {
    id: number;
    alt: string;
    src: { large2x?: string; large?: string; original: string; medium?: string; small?: string };
  }) => ({
    id: p.id,
    url: p.src.large2x || p.src.large || p.src.original,
    thumbnail: p.src.medium || p.src.small || p.src.original,
    alt: p.alt || "",
  }));

  return NextResponse.json({ photos });
}
