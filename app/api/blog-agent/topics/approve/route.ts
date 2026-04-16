import { NextRequest, NextResponse } from "next/server";
import { getTopics, saveTopic, deleteTopic } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topicId, action } = body;

    if (!topicId || !action) {
      return NextResponse.json(
        { error: "topicId and action (approve/reject) required" },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    // Reject = delete. Rejected topics are never useful later, no reason to keep them.
    if (action === "reject") {
      const deleted = await deleteTopic(topicId);
      if (!deleted) {
        return NextResponse.json({ error: "Topic not found" }, { status: 404 });
      }
      return NextResponse.json({ deleted: true });
    }

    const topics = await getTopics();
    const topic = topics.find((t) => t.id === topicId);

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    if (topic.status !== "pending") {
      return NextResponse.json(
        { error: `Topic already ${topic.status}` },
        { status: 400 }
      );
    }

    topic.status = "approved";
    topic.approvedAt = new Date().toISOString();

    await saveTopic(topic);
    return NextResponse.json({ topic });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update topic" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { topicIds, action } = body;

    if (!topicIds?.length || !action) {
      return NextResponse.json(
        { error: "topicIds array and action required" },
        { status: 400 }
      );
    }

    // Bulk reject = bulk delete
    if (action === "reject") {
      let deletedCount = 0;
      for (const topicId of topicIds) {
        const ok = await deleteTopic(topicId);
        if (ok) deletedCount++;
      }
      return NextResponse.json({ deleted: deletedCount });
    }

    const topics = await getTopics();
    const updated = [];

    for (const topicId of topicIds) {
      const topic = topics.find((t) => t.id === topicId);
      if (!topic || topic.status !== "pending") continue;

      topic.status = "approved";
      topic.approvedAt = new Date().toISOString();

      await saveTopic(topic);
      updated.push(topic);
    }

    return NextResponse.json({ updated: updated.length, topics: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to bulk update topics" },
      { status: 500 }
    );
  }
}
