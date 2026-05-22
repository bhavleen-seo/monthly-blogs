import { NextRequest, NextResponse } from "next/server";
import { getTopics, getClients, getClient, runResearch, deleteTopicsByClient } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // single-client research needs up to 90 s; 120 gives buffer

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") || undefined;
    const status = searchParams.get("status") || undefined;
    const month = searchParams.get("month") || undefined;

    const topics = await getTopics({ clientId, status, month });
    const clients = await getClients();
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    const enrichedTopics = topics.map((t) => ({
      ...t,
      clientName: clientMap.get(t.clientId)?.businessName || "Unknown",
    }));

    return NextResponse.json({ topics: enrichedTopics });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch topics" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientId = body.clientId || undefined;
    const regenerate = body.regenerate || false;

    if (clientId) {
      const client = await getClient(clientId);
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
    }

    if (regenerate && clientId) {
      await deleteTopicsByClient(clientId, "pending");
    }

    const { run, topicsByClient } = await runResearch(clientId);
    const totalTopics = Object.values(topicsByClient).reduce(
      (sum, topics) => sum + topics.length,
      0
    );

    // Surface research errors (e.g. bad model ID, missing API key) to the UI
    if (totalTopics === 0 && run.details) {
      return NextResponse.json(
        { error: run.details, run, totalTopics, topicsByClient },
        { status: 500 }
      );
    }

    return NextResponse.json({ run, totalTopics, topicsByClient });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run research" },
      { status: 500 }
    );
  }
}
