import { NextRequest, NextResponse } from "next/server";
import { getPosts, getClients, runWriting, getPost, savePost, deletePost, deleteFromWordPress, getClient } from "@/lib/blog-agent";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") || undefined;
    const status = searchParams.get("status") || undefined;

    const posts = await getPosts({ clientId, status });
    const clients = await getClients();
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    const enrichedPosts = posts.map((p) => ({
      ...p,
      clientName: clientMap.get(p.clientId)?.businessName || "Unknown",
    }));

    return NextResponse.json({ posts: enrichedPosts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }
    const existing = await getPost(body.id);
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const ALLOWED = ["title", "h1", "slug", "content", "excerpt", "metaDescription", "tags", "featuredImageUrl"];
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in body) updates[key] = body[key];
    }
    if (typeof updates.content === "string") {
      updates.wordCount = (updates.content as string).replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
    }
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await savePost(updated);
    return NextResponse.json({ post: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update post" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const deleteFromWp = searchParams.get("deleteFromWp") === "true";
    if (!id) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }

    // Try WordPress delete FIRST (while we still have the post record with
    // wordpressPostId). If it fails, we still delete from the dashboard but
    // return the error so the UI can surface a manual-delete link.
    let wpResult: { success: boolean; message: string } | undefined;
    if (deleteFromWp) {
      const post = await getPost(id);
      if (post?.wordpressPostId) {
        const client = await getClient(post.clientId);
        if (client) {
          wpResult = await deleteFromWordPress(client, post.wordpressPostId);
        } else {
          wpResult = { success: false, message: "Client not found for this post" };
        }
      } else {
        wpResult = { success: false, message: "No WordPress post ID on this post — nothing to delete in WP" };
      }
    }

    const deleted = await deletePost(id);
    if (!deleted) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, wpResult });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete post" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientId = body.clientId || undefined;
    const topicIds: string[] | undefined = Array.isArray(body.topicIds) && body.topicIds.length > 0
      ? body.topicIds
      : undefined;

    const { run, posts } = await runWriting(clientId, topicIds);

    return NextResponse.json({
      run,
      postsWritten: posts.length,
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        wordCount: p.wordCount,
        status: p.status,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to write posts" },
      { status: 500 }
    );
  }
}
