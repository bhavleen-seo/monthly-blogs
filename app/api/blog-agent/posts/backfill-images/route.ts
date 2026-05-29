import { NextRequest, NextResponse } from "next/server";
import { getPosts, savePost, getClient } from "@/lib/blog-agent/store";
import { searchStockImage, buildAltText } from "@/lib/blog-agent/freepik";
import type { BlogPost } from "@/lib/blog-agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/blog-agent/posts/backfill-images
 *
 * Finds every post that is missing a featuredImageUrl and searches Freepik
 * for one. Tries up to 5 progressively simpler queries per post so even
 * niche topics get something.
 *
 * Body (all optional):
 *   { postId?: string }  — if provided, only patches that one post
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const postId: string | undefined = body.postId;
    // force=true re-fetches images even for posts that already have one
    const force: boolean = body.force === true;

    const all = await getPosts();
    const targets: BlogPost[] = postId
      ? all.filter((p) => p.id === postId)
      : force
        ? all                                    // force=true → re-fetch every post
        : all.filter((p) => !p.featuredImageUrl); // default → only posts with no image yet

    if (targets.length === 0) {
      return NextResponse.json({ updated: 0, failed: 0, message: "No posts need images" });
    }

    // Build a per-client set of already-used Freepik IDs so we don't reuse images.
    const usedByClient = new Map<string, Set<string | number>>();
    for (const p of all) {
      if (p.freepikId) {
        if (!usedByClient.has(p.clientId)) usedByClient.set(p.clientId, new Set());
        usedByClient.get(p.clientId)!.add(p.freepikId);
      }
    }

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const post of targets) {
      try {
        const excludedIds = usedByClient.get(post.clientId);

        // Look up the client so we can pass their industry keywords as visual
        // hints to Freepik. Short concrete nouns (e.g. "business uniforms",
        // "workwear") produce far better results than a blog title does.
        let visualHints: string[] = [];
        try {
          const client = await getClient(post.clientId);
          if (client?.keywords) {
            visualHints = client.keywords.slice(0, 3).filter((k: string) => k.length > 0);
          }
        } catch {
          // Non-fatal — proceed without visual hints
        }

        const primaryQuery = post.featuredImagePrompt || post.title;
        const fallbackQuery = post.title !== primaryQuery ? post.title : undefined;

        const image = await searchStockImage(primaryQuery, fallbackQuery, excludedIds, visualHints);

        if (image) {
          post.featuredImageUrl = image.url;
          post.freepikId = image.freepikId;
          // Always ensure alt text is set — fall back to title if no prompt
          if (!post.featuredImageAlt) {
            post.featuredImageAlt = post.featuredImagePrompt
              ? buildAltText(post.featuredImagePrompt)
              : post.title;
          }
          post.updatedAt = new Date().toISOString();
          await savePost(post);

          if (!usedByClient.has(post.clientId)) usedByClient.set(post.clientId, new Set());
          usedByClient.get(post.clientId)!.add(image.freepikId);

          updated++;
          console.log(`[backfill-images] ✓ ${post.clientName} — "${post.title.slice(0, 60)}"`);
        } else {
          failed++;
          const msg = `No Freepik image found for "${post.title.slice(0, 50)}" — all queries returned empty`;
          errors.push(msg);
          console.warn(`[backfill-images] ✗ ${msg}`);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${post.clientName}: ${msg}`);
        console.error(`[backfill-images] Error for post ${post.id}:`, msg);
      }
    }

    return NextResponse.json({
      updated,
      failed,
      total: targets.length,
      // Surface first error so the UI can show what's going wrong
      firstError: errors[0] || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backfill failed" },
      { status: 500 }
    );
  }
}
