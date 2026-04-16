import { NextRequest, NextResponse } from "next/server";
import { getGlobalSettings, saveGlobalSettings, getStorageDiagnostics } from "@/lib/blog-agent";
import type { GlobalSettings } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

export async function GET() {
  const _storage = getStorageDiagnostics();
  try {
    const settings = await getGlobalSettings();
    return NextResponse.json({ settings, _storage }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch settings", _storage },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const _storage = getStorageDiagnostics();
  try {
    const body: Partial<GlobalSettings> = await req.json();
    const current = await getGlobalSettings();
    const updated: GlobalSettings = {
      ...current,
      ...body,
      preferredWordCount: body.preferredWordCount || current.preferredWordCount,
    };
    await saveGlobalSettings(updated);
    // Read back to verify the save actually persisted
    const verified = await getGlobalSettings();
    return NextResponse.json({ settings: verified, _storage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings", _storage },
      { status: 500 }
    );
  }
}
