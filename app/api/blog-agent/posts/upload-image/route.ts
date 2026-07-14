import { NextRequest, NextResponse } from "next/server";
import { getPost, getClient } from "@/lib/blog-agent";
import { savePost } from "@/lib/blog-agent/store";
import { syncFeaturedImageToWordPress } from "@/lib/blog-agent/publisher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/blog-agent/posts/upload-image
 * Body: multipart/form-data  →  postId (string) + image (File, resized to 750x500 by browser)
 *
 * Stores the image in KV (14-day TTL) and saves the resulting URL as
 * the post's featuredImageUrl.
 *
 * If the post is already PUBLISHED, the new image is pushed straight to the
 * live WordPress post in this same request — so pasting an image is all the
 * SEO has to do, no separate "Sync image" click. For drafts, the image is
 * staged and goes up when the post is published.
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

    // Already published? Push the new image to the live WordPress post now, so
    // the SEO doesn't have to click "Sync image" as a separate step. Drafts are
    // just staged — the image uploads when the post is published.
    let sync: { success: boolean; message: string } | undefined;
    if (updatedPost.status === "published" && updatedPost.wordpressPostId) {
      const client = await getClient(updatedPost.clientId);
      sync = client
        ? await syncFeaturedImageToWordPress(client, updatedPost)
        : { success: false, message: "Image saved, but the client record wasn't found so it couldn't be pushed to WordPress." };
    }

    return NextResponse.json({ success: true, featuredImageUrl: imageUrl, post: updatedPost, sync });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
