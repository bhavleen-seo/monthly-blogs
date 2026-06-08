import { NextRequest, NextResponse } from "next/server";
import { getPost } from "@/lib/blog-agent";
import { savePost } from "@/lib/blog-agent/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/blog-agent/posts/upload-image
 * Body: multipart/form-data  →  postId (string) + image (File, pre-resized by browser)
 *
 * Stores the image in KV (14-day TTL) and saves the resulting URL as
 * the post's featuredImageUrl. No WordPress connection needed at this
 * stage — the publisher will upload the image to WP when the post is
 * published, the same way it handles Pexels image URLs.
 *
 * For already-published posts, use the "Sync to WP" button afterwards
 * to push the new image to the live WordPress post.
 */
export async function POST(req: NextRequest) {
  try {
    const form   = await req.formData();
    const postId = (form.get("postId") as string | null)?.trim() || "";
    const file   = form.get("image") as File | null;

    if (!postId || !file) {
      return NextResponse.json({ error: "postId and image are required" }, { status: 400 });
    }

    const post = await getPost(postId);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const buffer      = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";
    const filename    = file.name || `${post.slug || post.id}.jpg`;

    // Store in KV for 14 days — long enough to review, edit, and publish
    const { kv } = await import("@vercel/kv");
    const id  = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await kv.set(
      `temp-image:${id}`,
      { base64: buffer.toString("base64"), contentType, filename },
      { ex: 14 * 24 * 60 * 60 }   // 14 days
    );
    const imageUrl = `${req.nextUrl.origin}/api/blog-agent/posts/temp-image?id=${id}`;

    // Save the URL as the post's featured image
    const updatedPost = { ...post, featuredImageUrl: imageUrl, freepikId: id };
    await savePost(updatedPost);

    return NextResponse.json({ success: true, featuredImageUrl: imageUrl, post: updatedPost });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
