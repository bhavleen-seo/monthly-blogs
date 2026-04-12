import { NextRequest, NextResponse } from "next/server";
import { getStore, saveStore, getRuns } from "@/lib/blog-agent";
import type { ScheduleConfig } from "@/lib/blog-agent";

export async function GET() {
  try {
    const store = await getStore();
    const runs = await getRuns(20);
    return NextResponse.json({ schedule: store.schedule, recentRuns: runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch schedule" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body: Partial<ScheduleConfig> = await req.json();
    const store = await getStore();
    store.schedule = { ...store.schedule, ...body };
    await saveStore(store);
    return NextResponse.json({ schedule: store.schedule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update schedule" },
      { status: 500 }
    );
  }
}
