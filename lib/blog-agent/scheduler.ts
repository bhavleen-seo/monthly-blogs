import cron from "node-cron";
import { getStore } from "./store";
import { runResearch, runWriting, runPublishing } from "./agent";

let researchJob: cron.ScheduledTask | null = null;
let writeJob: cron.ScheduledTask | null = null;
let publishJob: cron.ScheduledTask | null = null;

/**
 * Get the last business day of a given month.
 * If the last day falls on Saturday, use the previous Friday.
 * If the last day falls on Sunday, use the next Monday.
 */
function getLastBusinessDay(year: number, month: number): Date {
  // month is 0-indexed (0 = Jan, 11 = Dec)
  const lastDay = new Date(year, month + 1, 0); // last day of month
  const dayOfWeek = lastDay.getDay(); // 0=Sun, 6=Sat

  if (dayOfWeek === 6) {
    // Saturday → extend to next Monday
    lastDay.setDate(lastDay.getDate() + 2);
  } else if (dayOfWeek === 0) {
    // Sunday → extend to next Monday
    lastDay.setDate(lastDay.getDate() + 1);
  }

  return lastDay;
}

/**
 * Check if today is the publish day (last business day of month,
 * or next Monday if month ends on weekend).
 */
function isTodayPublishDay(): boolean {
  const now = new Date();
  const publishDate = getLastBusinessDay(now.getFullYear(), now.getMonth());
  return (
    now.getFullYear() === publishDate.getFullYear() &&
    now.getMonth() === publishDate.getMonth() &&
    now.getDate() === publishDate.getDate()
  );
}

export async function startScheduler(): Promise<void> {
  stopScheduler();

  const store = await getStore();
  const { schedule } = store;

  if (!schedule.enabled) return;

  // Research topics on the configured day at 9:00 AM
  researchJob = cron.schedule(
    `0 9 ${schedule.researchDayOfMonth} * *`,
    async () => {
      console.log("[Scheduler] Running monthly topic research...");
      const { run } = await runResearch();
      console.log(`[Scheduler] Research complete: ${run.message}`);
    },
    { timezone: schedule.timezone }
  );

  // Write posts on the configured day at 9:00 AM
  writeJob = cron.schedule(
    `0 9 ${schedule.writeDayOfMonth} * *`,
    async () => {
      console.log("[Scheduler] Running monthly post writing...");
      const { run } = await runWriting();
      console.log(`[Scheduler] Writing complete: ${run.message}`);
    },
    { timezone: schedule.timezone }
  );

  // Publish: check every day at 9:00 AM if today is the last business day
  publishJob = cron.schedule(
    `0 9 * * 1-5`,
    async () => {
      if (!isTodayPublishDay()) return;
      console.log("[Scheduler] Last business day of month — publishing posts...");
      const { run } = await runPublishing();
      console.log(`[Scheduler] Publishing complete: ${run.message}`);
    },
    { timezone: schedule.timezone }
  );

  const nextPublish = getLastBusinessDay(
    new Date().getFullYear(),
    new Date().getMonth()
  );
  console.log(
    `[Scheduler] Started — Research: day ${schedule.researchDayOfMonth}, Write: day ${schedule.writeDayOfMonth}, Publish: last business day (next: ${nextPublish.toDateString()})`
  );
}

export function stopScheduler(): void {
  if (researchJob) {
    researchJob.stop();
    researchJob = null;
  }
  if (writeJob) {
    writeJob.stop();
    writeJob = null;
  }
  if (publishJob) {
    publishJob.stop();
    publishJob = null;
  }
}

export { getLastBusinessDay };
