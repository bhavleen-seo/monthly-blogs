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
      {/* Schedule config */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-[var(--color-foreground)]">Automation Schedule</h3>
          <button
            onClick={handleSave}
            className={`px-5 py-2 rounded-lg text-sm font-medium text-[var(--color-primary-foreground)] transition-all ${saved ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)] hover:opacity-90"}`}
          >
            {saved ? "Saved!" : "Save Schedule"}
          </button>
        </div>

        <div className="space-y-5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[var(--color-muted)] peer-checked:bg-[var(--color-success)] rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
            </div>
            <span className="text-sm text-[var(--color-foreground)]">Enable monthly automation</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Research Day</label>
              <input
                type="number" min="1" max="28"
                value={schedule.researchDayOfMonth}
                onChange={(e) => setSchedule({ ...schedule, researchDayOfMonth: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]"
              />
              <p className="text-[10px] text-[var(--color-muted-foreground)] mt-1">Day topics are generated</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Write Day</label>
              <input
                type="number" min="1" max="28"
                value={schedule.writeDayOfMonth}
                onChange={(e) => setSchedule({ ...schedule, writeDayOfMonth: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]"
              />
              <p className="text-[10px] text-[var(--color-muted-foreground)] mt-1">Day approved topics are written</p>
            </div>
          </div>

          <div className="bg-[var(--color-muted)] rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-[var(--color-foreground)]">Publish: Last business day of the month</p>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">Moves to Monday if month ends on a weekend.</p>
          </div>
        </div>
      </div>

      {/* Workflow overview */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6">
        <h3 className="font-semibold text-[var(--color-foreground)] mb-4">Monthly Workflow</h3>
        <div className="space-y-3">
          {[
            { day: `Day ${schedule.researchDayOfMonth}`, desc: "Agent researches trending topics for all active clients" },
            { day: `Day ${schedule.researchDayOfMonth}-${schedule.writeDayOfMonth}`, desc: "You review and approve/reject topic suggestions" },
            { day: `Day ${schedule.writeDayOfMonth}`, desc: "Agent writes SEO-optimized blog posts for approved topics" },
            { day: `Day ${schedule.writeDayOfMonth}+`, desc: "You review written posts and make any edits" },
            { day: "Last biz day", desc: "Agent publishes all ready posts to WordPress" },
          ].map((step, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-xs font-mono font-medium text-[var(--color-primary)] w-24 shrink-0 pt-0.5">{step.day}</span>
              <span className="text-sm text-[var(--color-muted-foreground)]">{step.desc}</span>
            </div>
          ))}
        </div>
      </div>

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
