import { NextRequest, NextResponse } from "next/server";
import { getPosts, getClients, runWriting } from "@/lib/blog-agent";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientId = body.clientId || undefined;

    const { run, posts } = await runWriting(clientId);

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
