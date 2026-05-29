import { NextRequest, NextResponse } from "next/server";
import { getPosts, getClient } from "@/lib/blog-agent/store";
import { syncFeaturedImageToWordPress } from "@/lib/blog-agent/publisher";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/blog-agent/posts/sync-images
 *
 * Pushes updated featured images to already-published WordPress posts.
 * Requires the CS Publisher plugin v1.1+ (updated template with update_image_only support).
 *
 * Body (all optional):
 *   { postId?: string }  — if provided, only syncs that one post
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const postId: string | undefined = body.postId;

    const all = await getPosts();
    const targets = postId
      ? all.filter((p) => p.id === postId)
      : all.filter((p) => p.status === "published" && p.wordpressPostId && p.featuredImageUrl);

    if (targets.length === 0) {
      return NextResponse.json({ synced: 0, failed: 0, message: "No published posts with images and WordPress IDs found" });
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const post of targets) {
      try {
        const client = await getClient(post.clientId);
        if (!client) {
          failed++;
          errors.push(`${post.clientName || post.clientId}: Client not found`);
          continue;
        }

        const result = await syncFeaturedImageToWordPress(client, post);

        if (result.success) {
          synced++;
          console.log(`[sync-images] ✓ ${client.businessName} — "${post.title.slice(0, 50)}"`);
        } else {
          failed++;
          errors.push(`${client.businessName}: ${result.message}`);
          console.warn(`[sync-images] ✗ ${client.businessName} — ${result.message}`);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${post.clientName || post.clientId}: ${msg}`);
        console.error(`[sync-images] Error for post ${post.id}:`, msg);
      }
    }

    return NextResponse.json({
      synced,
      failed,
      total: targets.length,
      firstError: errors[0] || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
