import { NextResponse } from "next/server";
import { getClients, testWordPressConnection } from "@/lib/blog-agent";

export async function POST() {
  try {
    const clients = await getClients();

    // Test all clients in parallel (30-second timeout per client).
    const results = await Promise.allSettled(
      clients.map(async (client) => {
        const result = await testWordPressConnection(client);
        return {
          id: client.id,
          businessName: client.businessName,
          hasPlugin: !!client.csPublisherSecret,
          ...result,
        };
      })
    );

    const rows = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        id: clients[i].id,
        businessName: clients[i].businessName,
        hasPlugin: !!clients[i].csPublisherSecret,
        success: false,
        message: r.reason instanceof Error ? r.reason.message : "Unknown error",
      };
    });

    const passed = rows.filter((r) => r.success).length;
    return NextResponse.json({ results: rows, passed, total: rows.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch test failed" },
      { status: 500 }
    );
  }
}
