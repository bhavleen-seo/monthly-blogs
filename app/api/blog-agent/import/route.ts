import { NextRequest, NextResponse } from "next/server";
import { getStore, saveStore } from "@/lib/blog-agent/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || body.version !== 1) {
      return NextResponse.json(
        { error: "Invalid export file — make sure you're uploading a file exported from this dashboard." },
        { status: 400 }
      );
    }

    const current = await getStore();
    const results: string[] = [];

    if (Array.isArray(body.clients) && body.clients.length > 0) {
      current.clients = body.clients;
      results.push(`${body.clients.length} clients`);
    }
    if (Array.isArray(body.topics) && body.topics.length > 0) {
      current.topics = body.topics;
      results.push(`${body.topics.length} topics`);
    }
    if (Array.isArray(body.posts) && body.posts.length > 0) {
      current.posts = body.posts;
      results.push(`${body.posts.length} posts`);
    }
    if (body.settings && typeof body.settings === "object") {
      current.globalSettings = { ...current.globalSettings, ...body.settings };
      results.push("settings");
    }
    if (body.schedule && typeof body.schedule === "object") {
      current.schedule = body.schedule;
      results.push("schedule");
    }

    await saveStore(current);

    return NextResponse.json({ success: true, imported: results.join(", ") });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
