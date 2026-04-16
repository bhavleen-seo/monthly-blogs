import { NextRequest, NextResponse } from "next/server";
import { getGlobalSettings, saveGlobalSettings } from "@/lib/blog-agent";
import type { GlobalSettings } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getGlobalSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body: Partial<GlobalSettings> = await req.json();
    const current = await getGlobalSettings();
    const updated: GlobalSettings = {
      ...current,
      ...body,
      preferredWordCount: body.preferredWordCount || current.preferredWordCount,
    };
    await saveGlobalSettings(updated);
    return NextResponse.json({ settings: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 }
    );
  }
}
