import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Temporary image store — used when native WP REST is blocked (e.g. Wordfence
 * disables Application Passwords) and we need to give CS Publisher a URL to
 * download from instead of raw file bytes.
 *
 * POST: store an image (base64) in KV with a 1-hour TTL, return a temp URL.
 * GET ?id=xxx: serve the stored image bytes back so CS Publisher can download it.
 */

async function getKV() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import("@vercel/kv");
    return kv;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "image required" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64  = buffer.toString("base64");
    const id      = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key     = `temp-image:${id}`;

    const kv = await getKV();
    if (!kv) return NextResponse.json({ error: "KV not configured" }, { status: 500 });

    // Store for 1 hour (3600 seconds)
    await kv.set(key, { base64, contentType: file.type || "image/jpeg", filename: file.name }, { ex: 3600 });

    // Build the URL that CS Publisher will download from
    const origin = req.nextUrl.origin;
    const tempUrl = `${origin}/api/blog-agent/posts/temp-image?id=${id}`;

    return NextResponse.json({ tempUrl, id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id  = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!id) return new NextResponse("id required", { status: 400 });

  try {
    const kv = await getKV();
    if (!kv) return new NextResponse("KV not configured", { status: 500 });

    const data = await kv.get<{ base64: string; contentType: string; filename: string }>(`temp-image:${id}`);
    if (!data) return new NextResponse("Image not found or expired", { status: 404 });

    const buffer = Buffer.from(data.base64, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": data.contentType,
        "Content-Disposition": `inline; filename="${data.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Error", { status: 500 });
  }
}
