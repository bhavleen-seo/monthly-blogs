import { NextResponse } from "next/server";
import { clearAllTopics, deleteUnpublishedPosts } from "@/lib/blog-agent/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/blog-agent/reset
 * Deletes ALL topics (pending, approved, rejected — every month) and all
 * unpublished posts (draft, ready, failed). Published posts are NOT touched.
 * Used to start fresh before re-running research.
 */
export async function POST() {
  try {
    const [topicsDeleted, postsDeleted] = await Promise.all([
      clearAllTopics(),
      deleteUnpublishedPosts(),
    ]);
    return NextResponse.json({ topicsDeleted, postsDeleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reset failed" },
      { status: 500 }
    );
  }
}
