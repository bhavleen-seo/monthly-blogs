/**
 * Sync-credentials endpoint.
 *
 * GET  — returns the current sync status (last run time, matched/unmatched counts)
 * POST — dispatches the Bitwarden-sync GitHub Action workflow.
 *
 * The actual Bitwarden CLI runs in a GitHub Action (its native deps don't
 * build in Vercel serverless). The Action POSTs back to /receive-credentials
 * with the raw items, which are matched + encrypted server-side.
 *
 * Required env for POST:
 *   GITHUB_TOKEN       — PAT with `actions:write` on the repo
 *   GITHUB_REPO        — owner/repo (e.g. "bhavleen-seo/monthly-blogs")
 *   SYNC_WORKFLOW_FILE — workflow filename (defaults to "bitwarden-sync.yml")
 *   SYNC_WORKFLOW_REF  — branch to run from (defaults to "main")
 */

import { NextResponse } from "next/server";
import { getClients, getWpCredsStore } from "@/lib/blog-agent/store";

/** GET — return current sync status. */
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

/** POST — dispatch the GitHub Action workflow. */
export async function POST() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const workflow = process.env.SYNC_WORKFLOW_FILE || "bitwarden-sync.yml";
  const ref = process.env.SYNC_WORKFLOW_REF || "main";

  if (!token || !repo) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO must be set in Vercel env to dispatch the sync workflow." },
      { status: 501 }
    );
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref }),
      }
    );

    if (res.status !== 204) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `GitHub dispatch failed (${res.status}): ${errText.slice(0, 300)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Sync workflow dispatched. Results available in ~1-2 minutes.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dispatch failed" },
      { status: 500 }
    );
  }
}
