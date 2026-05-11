"use client";

import { useState, useEffect } from "react";

export default function ScheduleTab() {
  const [schedule, setSchedule] = useState({
    enabled: false,
    researchDayOfMonth: 1,
    writeDayOfMonth: 10,
    publishDayOfMonth: 15,
    timezone: "Australia/Melbourne",
  });
  const [runs, setRuns] = useState<Array<{ id: string; type: string; status: string; message: string; startedAt: string }>>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/blog-agent/schedule", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.schedule) setSchedule(data.schedule);
        if (data.recentRuns) setRuns(data.recentRuns);
      });
  }, []);

  const handleSave = async () => {
    await fetch("/api/blog-agent/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Active automation schedule (fixed by Vercel cron) */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[var(--color-foreground)]">Automation Schedule</h3>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-success)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
            Active
          </span>
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
          Runs daily at ~9am Melbourne time via Vercel Cron. The dates below are fixed in <code className="text-xs px-1 py-0.5 rounded bg-[var(--color-muted)]">vercel.json</code> — changing them requires a code deploy.
        </p>

        <div className="space-y-3">
          {[
            { day: "Day 1", desc: "Researcher generates 5 topic ideas per active client. Slack ping when ready." },
            { day: "Days 1-9", desc: "You review topics in the dashboard and approve one per client." },
            { day: "Day 8", desc: "Slack reminder if any clients still have no approved topic." },
            { day: "Day 10", desc: "Writing kicks off: non-approved topics are auto-cleared, approved ones get written." },
            { day: "Days 11-19", desc: "Daily silent sweep catches any late approvals and writes them." },
            { day: "Day 20", desc: "Approval window closes. Slack ping listing any clients that didn't get a post this cycle." },
            { day: "Anytime", desc: "You publish posts manually from the Posts tab when you're ready." },
          ].map((step, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-xs font-mono font-medium text-[var(--color-primary)] w-20 shrink-0 pt-0.5">{step.day}</span>
              <span className="text-sm text-[var(--color-muted-foreground)]">{step.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Legacy schedule config — kept for manual single-client trigger preferences */}
      <details className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6 group">
        <summary className="cursor-pointer flex items-center justify-between">
          <h3 className="font-semibold text-[var(--color-foreground)]">Legacy schedule config</h3>
          <span className="text-xs text-[var(--color-muted-foreground)]">click to expand</span>
        </summary>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-3 mb-4">
          The old day-of-month settings below are <strong>no longer used</strong> by the cron. They're kept here for reference. Edit <code className="text-xs px-1 py-0.5 rounded bg-[var(--color-muted)]">vercel.json</code> to change the live schedule.
        </p>

        <div className="space-y-5 opacity-60 pointer-events-none">
          <label className="flex items-center gap-3">
            <div className="relative">
              <input type="checkbox" checked={schedule.enabled} readOnly className="sr-only peer" />
              <div className="w-9 h-5 bg-[var(--color-muted)] peer-checked:bg-[var(--color-success)] rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
            </div>
            <span className="text-sm text-[var(--color-foreground)]">Enable monthly automation</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Research Day</label>
              <input type="number" value={schedule.researchDayOfMonth} readOnly className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Write Day</label>
              <input type="number" value={schedule.writeDayOfMonth} readOnly className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]" />
            </div>
          </div>
        </div>
        <button onClick={handleSave} className={`mt-4 px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--color-primary-foreground)] transition-all ${saved ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)] hover:opacity-90"}`}>
          {saved ? "Saved" : "Save legacy values"}
        </button>
      </details>

      {/* Recent runs */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-foreground)]">Recent Runs</h3>
        </div>
        {runs.length > 0 ? (
          <div className="divide-y divide-[var(--color-border)]">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    run.status === "completed" ? "bg-[var(--color-success)]" :
                    run.status === "failed" ? "bg-[var(--color-destructive)]" :
                    "bg-[var(--color-primary)] animate-pulse"
                  }`} />
                  <span className="text-xs font-medium text-[var(--color-foreground)] uppercase">{run.type}</span>
                  <span className="text-sm text-[var(--color-muted-foreground)]">{run.message}</span>
                </div>
                <span className="text-xs text-[var(--color-muted-foreground)] shrink-0">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-sm text-[var(--color-muted-foreground)]">No runs yet.</div>
        )}
      </div>
    </div>
  );
}
