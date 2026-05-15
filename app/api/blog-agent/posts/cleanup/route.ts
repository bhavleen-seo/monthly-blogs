import { NextResponse } from "next/server";
import { getPosts, deletePost } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

/** Deletes all posts that are not published (drafts, ready, failed). */
export async function POST() {
  try {
    const all = await getPosts();
    const toDelete = all.filter((p) => p.status !== "published");
    for (const post of toDelete) {
      await deletePost(post.id);
    }
    return NextResponse.json({ deleted: toDelete.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cleanup failed" },
      { status: 500 }
    );
  }
}
