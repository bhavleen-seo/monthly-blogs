import { NextRequest, NextResponse } from "next/server";
import { getPost, getClient } from "@/lib/blog-agent";
import { savePost } from "@/lib/blog-agent/store";
import { resolveCanonicalApiBase, getAuthHeader, uploadFeaturedImageBuffer } from "@/lib/blog-agent/publisher";

export const dynamic = "force-dynamic";

/**
 * POST /api/blog-agent/posts/upload-image
 * Body: multipart/form-data with fields:
 *   - postId (string)
 *   - image  (File)
 *
 * Uploads the image directly to the client's WordPress media library
 * and saves the resulting WordPress URL as the post's featuredImageUrl.
 * Returns { success, featuredImageUrl, wordpressMediaId }.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const postId = (form.get("postId") as string | null)?.trim() || "";
    const file   = form.get("image") as File | null;

    if (!postId || !file) {
      return NextResponse.json({ error: "postId and image are required" }, { status: 400 });
    }

    const post = await getPost(postId);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const client = await getClient(post.clientId);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    if (!client.wordpressAppPassword || !client.wordpressUsername) {
      return NextResponse.json(
        { error: "This client doesn't have WordPress credentials — add an app password in the Clients tab" },
        { status: 400 }
      );
    }

    const buffer      = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";
    const filename    = file.name || `${post.slug || post.id}.jpg`;

    const apiBase = await resolveCanonicalApiBase(client);
    const mediaId = await uploadFeaturedImageBuffer(client, apiBase, buffer, contentType, filename, post.featuredImageAlt || post.title);

    if (!mediaId) {
      return NextResponse.json({ error: "Failed to upload image to WordPress media library" }, { status: 502 });
    }

    // Get the WordPress-hosted URL for the uploaded image
    const authHeader = await getAuthHeader(client);
    const mediaRes   = await fetch(`${apiBase}/media/${mediaId}`, { headers: { Authorization: authHeader } });
    let wpImageUrl   = "";
    if (mediaRes.ok) {
      const mediaData: { source_url?: string } = await mediaRes.json();
      wpImageUrl = mediaData.source_url || "";
    }

    // Save the WP-hosted URL directly to the post record via store
    const updatedPost = {
      ...post,
      featuredImageUrl: wpImageUrl || `${apiBase}/media/${mediaId}`,
      freepikId: String(mediaId),
    };
    await savePost(updatedPost);

    return NextResponse.json({
      success: true,
      featuredImageUrl: wpImageUrl,
      wordpressMediaId: mediaId,
      post: updatedPost,
    });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
