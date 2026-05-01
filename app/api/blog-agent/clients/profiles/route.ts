import { NextResponse } from "next/server";
import { getAllSiteProfiles } from "@/lib/blog-agent/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = await getAllSiteProfiles();
    return NextResponse.json(profiles);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch profiles" },
      { status: 500 }
    );
  }
}
