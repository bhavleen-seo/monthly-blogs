import { NextRequest, NextResponse } from "next/server";
import {
  getClients,
  getTopics,
  getPosts,
  deleteTopicsByClient,
} from "@/lib/blog-agent/store";
import { runResearch, runWriting } from "@/lib/blog-agent/agent";
import { notify } from "@/lib/blog-agent/notifier";

/**
 * Single daily cron endpoint.
 *
 * Wired to vercel.json as one daily UTC cron (22:00 UTC ≈ 9am Melbourne).
 * This handler reads the current Melbourne day-of-month and dispatches:
 *
 *   • Day 1   — runResearch() for all active clients; one consolidated Slack ping
 *   • Day 8   — reminder Slack if any clients still have zero approved topics
 *   • Day 10  — first write sweep: clear unapproved topics, write the approved one
 *   • Days 11-19 — daily silent sweep (catches late approvals; no Slack unless work was done)
 *   • Day 20  — final sweep + closure ping ("X skipped this month")
 *
 * Vercel automatically calls this with Authorization: Bearer $CRON_SECRET when
 * the secret env var is set. If CRON_SECRET is unset, anyone can hit this URL —
 * fine for testing but you should set it in Vercel before going live.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro upper bound

function melbourneDayOfMonth(): number {
  const d = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "numeric",
  });
  return parseInt(d, 10);
}

function melbourneYearMonth(): string {
  // Returns YYYY-MM for the current Melbourne calendar month.
  const parts = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
  });
  // en-CA gives YYYY-MM-DD; trim the day. (Safer than en-AU which gives DD/MM/YYYY.)
  return parts.slice(0, 7);
}

function nextMelbourneYearMonth(): string {
  // Researcher tags topics with NEXT month (research May → topics for June).
  // Mirror that logic here so we can find this cycle's topics during sweeps.
  const now = new Date();
  const melNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Australia/Melbourne" })
  );
  const next = new Date(melNow.getFullYear(), melNow.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, allow — useful for first-time setup / manual testing.
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?force=research|remind|write lets you trigger any branch manually for testing.
  const url = new URL(req.url);
  const forced = url.searchParams.get("force");
  const day = forced ? -1 : melbourneDayOfMonth();

  // ── Day 1 — research ─────────────────────────────────────────────────────
  if (day === 1 || forced === "research") {
    const { run } = await runResearch();
    const clients = (await getClients()).filter((c) => c.isActive);
    // Count topics for the upcoming month (researcher tags them as next month).
    const targetMonth = nextMelbourneYearMonth();
    const topics = await getTopics({ month: targetMonth });
    await notify.researchCompleteSummary(clients.length, topics.length);
    return NextResponse.json({
      ran: "research",
      day: forced ? "forced" : day,
      clients: clients.length,
      topicsGenerated: topics.length,
      runId: run.id,
    });
  }

  // ── Day 8 — approval reminder ─────────────────────────────────────────────
  if (day === 8 || forced === "remind") {
    const clients = (await getClients()).filter((c) => c.isActive);
    const targetMonth = nextMelbourneYearMonth();
    const topics = await getTopics({ month: targetMonth });

    const pendingClients = clients
      .filter((c) => {
        const t = topics.filter((x) => x.clientId === c.id);
        return t.filter((x) => x.status === "approved").length === 0;
      })
      .map((c) => c.businessName);

    if (pendingClients.length > 0) {
      await notify.topicsPendingReminder(pendingClients);
    }
    return NextResponse.json({
      ran: "reminder",
      day: forced ? "forced" : day,
      stillPending: pendingClients.length,
    });
  }

  // ── Days 10-20 — write sweep ──────────────────────────────────────────────
  if ((day >= 10 && day <= 20) || forced === "write") {
    const isFirstSweep = day === 10;
    const isFinalDay = day === 20 || forced === "write-final";

    const clients = (await getClients()).filter((c) => c.isActive);
    const targetMonth = nextMelbourneYearMonth();
    const allTopics = await getTopics({ month: targetMonth });
    const allPosts = await getPosts();
    const writtenTopicIds = new Set(allPosts.map((p) => p.topicId));

    const topicIdsToWrite: string[] = [];
    const stillPending: string[] = [];

    for (const client of clients) {
      const clientTopics = allTopics.filter((t) => t.clientId === client.id);
      const approved = clientTopics.filter((t) => t.status === "approved");

      if (approved.length === 0) {
        stillPending.push(client.businessName);
        continue;
      }

      // Once a client has at least one approved topic, clear their remaining
      // pending topics for this month. User explicitly asked for this: as soon
      // as writing begins, the unselected suggestions get cleaned up.
      await deleteTopicsByClient(client.id, "pending");

      // Queue any approved topic that doesn't already have a written post.
      // Lets the sweep be safely re-run daily: already-written topics skip.
      for (const t of approved) {
        if (!writtenTopicIds.has(t.id)) topicIdsToWrite.push(t.id);
      }
    }

    let writtenCount = 0;
    if (topicIdsToWrite.length > 0) {
      const { posts } = await runWriting(undefined, topicIdsToWrite);
      writtenCount = posts.length;
    }

    // Slack policy:
    //  - Day 10 (first sweep): always summarise, even if nothing was written.
    //  - Days 11-19: stay silent unless we actually wrote something.
    //  - Day 20 (final): always summarise + send the "skipped this month" ping.
    const shouldSendSummary =
      isFirstSweep || isFinalDay || writtenCount > 0;

    if (shouldSendSummary) {
      await notify.writingSweepSummary(writtenCount, stillPending, isFinalDay);
    }

    if (isFinalDay && stillPending.length > 0) {
      await notify.clientsSkippedForMonth(stillPending);
    }

    return NextResponse.json({
      ran: "write-sweep",
      day: forced ? "forced" : day,
      isFirstSweep,
      isFinalDay,
      writtenCount,
      stillPending: stillPending.length,
    });
  }

  // ── Any other day — no-op ─────────────────────────────────────────────────
  return NextResponse.json({ ran: "nothing", day });
}
