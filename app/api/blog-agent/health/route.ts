import { NextResponse } from "next/server";
import { getStorageDiagnostics } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

/**
 * KV health check: writes a test value, reads it back, verifies persistence.
 * Hit this endpoint to confirm KV is actually working end-to-end.
 */
export async function GET() {
  const diag = getStorageDiagnostics();
  const results: Record<string, unknown> = { ...diag, tests: {} };

  if (diag.backend !== "kv") {
    return NextResponse.json({ ...results, error: "Not using KV — file storage only" });
  }

  try {
    // Dynamic import to avoid errors in file-storage mode
    let kv: { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<unknown>; del(key: string): Promise<unknown> };

    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const mod = await import("@vercel/kv");
      kv = mod.kv;
    } else if (process.env.REDIS_URL) {
      const parsed = new URL(process.env.REDIS_URL);
      const { createClient } = await import("@vercel/kv");
      kv = createClient({ url: `https://${parsed.hostname}`, token: parsed.password });
    } else {
      return NextResponse.json({ ...results, error: "No KV env vars" });
    }

    // Test 1: Write
    const testKey = "ba:health-check";
    const testVal = { ts: Date.now(), rand: Math.random() };
    const writeRes = await kv.set(testKey, testVal);
    (results.tests as Record<string, unknown>).write = { ok: true, response: String(writeRes) };

    // Test 2: Read back
    const readBack = await kv.get(testKey);
    (results.tests as Record<string, unknown>).readBack = { ok: true, value: readBack, matches: JSON.stringify(readBack) === JSON.stringify(testVal) };

    // Test 3: Check ba:settings key
    const settings = await kv.get("ba:settings");
    (results.tests as Record<string, unknown>).settingsKey = {
      exists: settings !== null,
      type: typeof settings,
      preview: settings ? JSON.stringify(settings).slice(0, 300) : null,
    };

    // Test 4: Check old blob key
    const oldBlob = await kv.get("blog-agent-store");
    (results.tests as Record<string, unknown>).oldBlobKey = {
      exists: oldBlob !== null,
      sizeEstimate: oldBlob ? JSON.stringify(oldBlob).length : 0,
    };

    // Cleanup
    await kv.del(testKey);

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({
      ...results,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
