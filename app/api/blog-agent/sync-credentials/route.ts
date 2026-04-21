import { NextResponse } from "next/server";
import { getClients, getWpCredsStore, saveWpCredsStore, type EncryptedWpCredEntry } from "@/lib/blog-agent/store";
import { fetchWordPressItems, extractClientNameFromItem, normalizeBusinessName, type BitwardenItem } from "@/lib/blog-agent/bitwarden";
import { encrypt } from "@/lib/blog-agent/credentials";

export const maxDuration = 60; // sync takes ~15-30s; give it headroom

/** GET — return current sync status (last run time, counts, unmatched). */
export async function GET() {
  try {
    const [store, clients] = await Promise.all([getWpCredsStore(), getClients()]);
    return NextResponse.json({
      lastSyncAt: store.lastSyncAt,
      lastSyncError: store.lastSyncError,
      totalClients: clients.length,
      matchedCount: store.entries.length,
      unmatchedClientIds: store.unmatchedClientIds,
      unmatchedItemNames: store.unmatchedItemNames,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load sync status" },
      { status: 500 }
    );
  }
}

/**
 * POST — trigger a sync from Bitwarden.
 *
 * The actual Bitwarden CLI runs in a GitHub Action (its native deps don't
 * build in Vercel serverless). This endpoint kicks off that workflow and
 * returns immediately — the Action calls back into /receive-credentials
 * with the encrypted blob.
 *
 * Until the GitHub Action path is wired, this returns a "not configured"
 * error so the dashboard surfaces a clear message instead of hanging.
 */
export async function POST() {
  const start = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = start; // reserved for future telemetry
  const actionConfigured = false; // toggled on once the GH Action workflow is live
  if (!actionConfigured) {
    return NextResponse.json({
      error: "Bitwarden sync runs via GitHub Action (not yet configured). Contact the admin to enable.",
    }, { status: 501 });
  }

  // ↓ When the GH Action is live, we'll instead dispatch the workflow here.
  // The code below is kept for local/self-hosted use where @bitwarden/cli is installed.
  try {
    const clients = await getClients();
    let items: BitwardenItem[];
    try {
      items = await fetchWordPressItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const prev = await getWpCredsStore();
      await saveWpCredsStore({ ...prev, lastSyncError: msg, lastSyncAt: new Date().toISOString() });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Build lookup by normalized client name.
    const clientByKey = new Map<string, { id: string; businessName: string }>();
    for (const c of clients) {
      clientByKey.set(normalizeBusinessName(c.businessName), { id: c.id, businessName: c.businessName });
    }

    const entries: EncryptedWpCredEntry[] = [];
    const matchedClientIds = new Set<string>();
    const unmatchedItemNames: string[] = [];

    for (const item of items) {
      const suffix = extractClientNameFromItem(item.name);
      if (!suffix) continue;
      const key = normalizeBusinessName(suffix);
      const match = clientByKey.get(key);
      if (!match) {
        unmatchedItemNames.push(item.name);
        continue;
      }
      const username = item.login?.username?.trim();
      const password = item.login?.password?.trim();
      if (!username || !password) {
        unmatchedItemNames.push(`${item.name} (missing username/password)`);
        continue;
      }
      entries.push({
        clientId: match.id,
        clientName: match.businessName,
        bitwardenItemId: item.id,
        bitwardenItemName: item.name,
        username: encrypt(username),
        password: encrypt(password),
        uri: item.login?.uris?.[0]?.uri?.trim() || null,
        updatedAt: new Date().toISOString(),
      });
      matchedClientIds.add(match.id);
    }

    const unmatchedClientIds = clients
      .filter((c) => !matchedClientIds.has(c.id))
      .map((c) => c.id);

    const store = {
      lastSyncAt: new Date().toISOString(),
      lastSyncError: null,
      unmatchedClientIds,
      unmatchedItemNames,
      entries,
    };
    await saveWpCredsStore(store);

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - start,
      matchedCount: entries.length,
      totalClients: clients.length,
      itemsSeen: items.length,
      unmatchedClientCount: unmatchedClientIds.length,
      unmatchedItemCount: unmatchedItemNames.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Sync failed";
    try {
      const prev = await getWpCredsStore();
      await saveWpCredsStore({ ...prev, lastSyncError: msg, lastSyncAt: new Date().toISOString() });
    } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
