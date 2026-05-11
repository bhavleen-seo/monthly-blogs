import { NextResponse } from "next/server";
import { getClients, deleteClient } from "@/lib/blog-agent/store";

/**
 * One-time cleanup: removes "GLW Shows" and "Rose Academies" from KV.
 * They were removed from the seed list, but the live KV still holds them
 * from the original seed load. Hit this URL once while logged in to
 * purge them. Idempotent — safe to call multiple times.
 */

export const dynamic = "force-dynamic";

const NAMES_TO_REMOVE = ["GLW Shows", "Rose Academies"];

export async function GET() {
  const clients = await getClients();
  const removed: string[] = [];

  for (const c of clients) {
    if (NAMES_TO_REMOVE.includes(c.businessName)) {
      await deleteClient(c.id);
      removed.push(c.businessName);
    }
  }

  return NextResponse.json({
    requested: NAMES_TO_REMOVE,
    removed,
    note:
      removed.length === 0
        ? "Nothing to remove — clients already gone."
        : `Removed ${removed.length} client(s) from KV.`,
  });
}
