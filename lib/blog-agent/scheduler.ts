import cron from "node-cron";
import { getStore } from "./store";
import { runResearch, runWriting, runPublishing } from "./agent";

let researchJob: cron.ScheduledTask | null = null;
let writeJob: cron.ScheduledTask | null = null;
let publishJob: cron.ScheduledTask | null = null;

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

  // Publish posts on the configured day at 9:00 AM
  publishJob = cron.schedule(
    `0 9 ${schedule.publishDayOfMonth} * *`,
    async () => {
      console.log("[Scheduler] Running monthly publishing...");
      const { run } = await runPublishing();
      console.log(`[Scheduler] Publishing complete: ${run.message}`);
    },
    { timezone: schedule.timezone }
  );

  console.log(
    `[Scheduler] Started — Research: day ${schedule.researchDayOfMonth}, Write: day ${schedule.writeDayOfMonth}, Publish: day ${schedule.publishDayOfMonth}`
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
