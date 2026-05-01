import { NextRequest, NextResponse } from "next/server";
import { getClient, getClientProfile, saveClientProfile } from "@/lib/blog-agent/store";
import { buildClientProfile } from "@/lib/blog-agent/site-profiler";

export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const profile = await getClientProfile(params.id);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await getClient(params.id);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const profile = await buildClientProfile(client);
    await saveClientProfile(profile);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build site profile" },
      { status: 500 }
    );
  }
}
