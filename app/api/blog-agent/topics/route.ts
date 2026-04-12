import { NextRequest, NextResponse } from "next/server";
import { getTopics, getClients, getClient, runResearch } from "@/lib/blog-agent";

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

    if (clientId) {
      const client = await getClient(clientId);
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
    }

    const { run, topicsByClient } = await runResearch(clientId);
    const totalTopics = Object.values(topicsByClient).reduce(
      (sum, topics) => sum + topics.length,
      0
    );

    return NextResponse.json({ run, totalTopics, topicsByClient });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run research" },
      { status: 500 }
    );
  }
}
