/**
 * Receives Bitwarden WordPress-credential items from the daily GitHub Action
 * (.github/workflows/bitwarden-sync.yml). The Action runs `bw` CLI on an
 * Ubuntu runner (the CLI's native deps don't build in Vercel serverless) and
 * POSTs raw items here.
 *
 * This endpoint:
 *   1. Validates the SYNC_INGEST_TOKEN Bearer
 *   2. Matches each item to a client by normalized business name
 *   3. Encrypts username + password with CREDS_MASTER_KEY (AES-256-GCM)
 *   4. Writes the encrypted blob to KV (ba:wpcreds)
 *
 * Raw credentials transit over HTTPS in the request body and are never
 * persisted unencrypted — they live in memory only long enough to encrypt.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getClients,
  getWpCredsStore,
  saveWpCredsStore,
  type EncryptedWpCredEntry,
} from "@/lib/blog-agent/store";
import {
  extractClientNameFromItem,
  normalizeBusinessName,
  type BitwardenItem,
} from "@/lib/blog-agent/bitwarden";
import { encrypt } from "@/lib/blog-agent/credentials";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.SYNC_INGEST_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const provided = m[1].trim();
  // Constant-time comparison to avoid timing leaks
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items?: BitwardenItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items) {
    return NextResponse.json({ error: "Body must include items[]" }, { status: 400 });
  }

  try {
    const clients = await getClients();
    const clientByKey = new Map<string, { id: string; businessName: string }>();
    for (const c of clients) {
      clientByKey.set(normalizeBusinessName(c.businessName), {
        id: c.id,
        businessName: c.businessName,
      });
    }

    const entries: EncryptedWpCredEntry[] = [];
    const matchedClientIds = new Set<string>();
    const unmatchedItemNames: string[] = [];

    for (const item of items) {
      if (item.type !== 1) continue; // only login items
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

    await saveWpCredsStore({
      lastSyncAt: new Date().toISOString(),
      lastSyncError: null,
      unmatchedClientIds,
      unmatchedItemNames,
      entries,
    });

    return NextResponse.json({
      success: true,
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
      await saveWpCredsStore({
        ...prev,
        lastSyncError: msg,
        lastSyncAt: new Date().toISOString(),
      });
    } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
