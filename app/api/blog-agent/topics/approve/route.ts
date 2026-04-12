import { NextRequest, NextResponse } from "next/server";
import { getTopics, saveTopic } from "@/lib/blog-agent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topicId, action, rejectionReason } = body;

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

    if (action === "approve") {
      topic.status = "approved";
      topic.approvedAt = new Date().toISOString();
    } else {
      topic.status = "rejected";
      topic.rejectedAt = new Date().toISOString();
      topic.rejectionReason = rejectionReason || "";
    }

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

    const topics = await getTopics();
    const updated = [];

    for (const topicId of topicIds) {
      const topic = topics.find((t) => t.id === topicId);
      if (!topic || topic.status !== "pending") continue;

      if (action === "approve") {
        topic.status = "approved";
        topic.approvedAt = new Date().toISOString();
      } else {
        topic.status = "rejected";
        topic.rejectedAt = new Date().toISOString();
      }

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
