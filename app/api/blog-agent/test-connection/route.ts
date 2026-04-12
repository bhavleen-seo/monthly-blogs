import { NextRequest, NextResponse } from "next/server";
import { getClient, testWordPressConnection } from "@/lib/blog-agent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }

    const client = await getClient(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const result = await testWordPressConnection(client);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Connection test failed" },
      { status: 500 }
    );
  }
}
