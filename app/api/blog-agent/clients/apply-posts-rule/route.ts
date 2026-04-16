import { NextResponse } from "next/server";
import { getClients, saveClient } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

// Clients that get 2 posts/month. Match case-insensitively against name or
// businessName — so "GLW Shows", "Rose Academies", etc. all match.
const TWO_POSTS_PER_MONTH = [/\bglw\b/i, /\brose\b/i];

/**
 * Apply the posts-per-month business rule to all existing clients:
 *   - Default: 1 post/month
 *   - Exceptions (GLW, Rose): 2 posts/month
 *
 * Idempotent — safe to run multiple times.
 */
export async function POST() {
  try {
    const clients = await getClients();
    const now = new Date().toISOString();
    const updates: Array<{ name: string; from: number; to: number }> = [];

    for (const client of clients) {
      const name = `${client.businessName} ${client.name}`;
      const isException = TWO_POSTS_PER_MONTH.some((rx) => rx.test(name));
      const desired = isException ? 2 : 1;

      if (client.postsPerMonth !== desired) {
        updates.push({ name: client.businessName, from: client.postsPerMonth, to: desired });
        await saveClient({ ...client, postsPerMonth: desired, updatedAt: now });
      }
    }

    return NextResponse.json({
      updatedCount: updates.length,
      totalClients: clients.length,
      updates,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply rule" },
      { status: 500 }
    );
  }
}
