"use client";

import { useMemo } from "react";
import type { Client, Topic, Post } from "./types";

export default function DashboardTab({
  clients,
  topics,
  posts,
  loading,
  onResearch,
  onWritePosts,
  onPublishPosts,
  onApprove,
  onBulkApprove,
  onReject,
}: {
  clients: Client[];
  topics: Topic[];
  posts: Post[];
  loading: boolean;
  onResearch: () => void;
  onWritePosts: () => void;
  onPublishPosts: () => void;
  onApprove: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onReject: (id: string) => void;
}) {
  const activeClients = clients.filter((c) => c.isActive);
  const pendingTopics = topics.filter((t) => t.status === "pending");

  // Target month = current calendar month.
  // Research, writing, and publishing all happen within the same month
  // (e.g. research in May → topics tagged "2026-05" → write & publish in May).
  const targetMonth = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const approvedTopics = topics.filter((t) => t.status === "approved" && (!t.month || t.month === targetMonth));
  const readyPosts = posts.filter((p) => p.status === "ready");
  const publishedPosts = posts.filter((p) => p.status === "published");

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const currentMonth = useMemo(() => {
    return new Date().toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }, []);

  const stats = [
    { label: "Active Clients", value: activeClients.length, color: "var(--color-foreground)" },
    { label: "Pending Topics", value: pendingTopics.length, color: "var(--color-warning)" },
    { label: "Ready to Publish", value: readyPosts.length, color: "var(--color-primary)" },
    { label: "Published", value: publishedPosts.length, color: "var(--color-success)" },
  ];

  const actions = [
    { step: "1", title: "Research Topics", desc: "AI generates topic ideas for active clients", btn: "Run Research", onClick: onResearch, disabled: loading || clients.length === 0 },
    { step: "2", title: "Write Posts", desc: `Write posts for ${approvedTopics.length} approved topics`, btn: "Write Posts", onClick: onWritePosts, disabled: loading || approvedTopics.length === 0 },
    { step: "3", title: "Publish", desc: `Publish ${readyPosts.length} ready posts to WordPress`, btn: "Publish All", onClick: onPublishPosts, disabled: loading || readyPosts.length === 0 },
  ];

  // Pipeline: per-client overview
  const pipeline = activeClients.map((c) => {
    const cTopics = topics.filter((t) => t.clientId === c.id);
    const cPosts = posts.filter((p) => p.clientId === c.id);
    return {
      id: c.id,
      name: c.businessName,
      pending: cTopics.filter((t) => t.status === "pending").length,
      approved: cTopics.filter((t) => t.status === "approved").length,
      written: cPosts.filter((p) => p.status === "ready" || p.status === "draft").length,
      published: cPosts.filter((p) => p.status === "published").length,
    };
  }).filter((c) => c.pending + c.approved + c.written + c.published > 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 dark:from-zinc-100 dark:via-zinc-200 dark:to-zinc-100 p-5 sm:p-8">
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5 dark:bg-black/5" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5 dark:bg-black/5" />
        <div className="absolute top-4 right-4 w-20 h-20 rounded-full bg-white/5 dark:bg-black/5" />

        <div className="relative z-10 flex items-start sm:items-center gap-4 sm:gap-5 flex-col sm:flex-row">
          <div className="shrink-0 bg-white/10 dark:bg-black/10 rounded-xl p-2.5 backdrop-blur-sm">
            {/* White logo on dark hero bg (light mode), dark logo on light hero bg (dark mode) */}
            <img
              src="https://www.csdesignstudios.com/wp-content/uploads/yootheme/cache/8d/cs-design-studios-logo-8d06a929.webp"
              alt="CS Design Studios"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain block dark:hidden"
            />
            <img
              src="https://www.csdesignstudios.com/wp-content/uploads/CSLOGONAV.webp"
              alt="CS Design Studios"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain hidden dark:block"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-white/60 dark:text-black/50">{greeting}</p>
            <h2 className="text-2xl font-bold text-white dark:text-black tracking-tight">{currentMonth} Overview</h2>
            <p className="text-sm text-white/50 dark:text-black/40 mt-1">
              {activeClients.length} active client{activeClients.length !== 1 ? "s" : ""} &middot; {publishedPosts.length} published this cycle
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={s.label} className={`stat-card stat-card-${i} bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5 transition-all duration-200 hover:border-[var(--color-primary)]/30 hover:-translate-y-0.5 hover:shadow-md`}>
            <p className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider">{s.label}</p>
            <p className="text-3xl font-bold mt-2" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {actions.map((a) => (
          <div key={a.step} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5 transition-all duration-200 hover:border-[var(--color-primary)]/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-bold flex items-center justify-center">{a.step}</span>
              <h3 className="font-semibold text-[var(--color-foreground)]">{a.title}</h3>
            </div>
            <p className="text-sm text-[var(--color-muted-foreground)] mb-4">{a.desc}</p>
            <button
              onClick={a.onClick}
              disabled={a.disabled}
              className="w-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {a.btn}
            </button>
          </div>
        ))}
      </div>

      {/* Pipeline overview */}
      {pipeline.length > 0 && (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-semibold text-[var(--color-foreground)]">Client Pipeline</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--color-muted-foreground)]">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />Pending</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#6366f1" }} />Approved</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#8b5cf6" }} />Written</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#10b981" }} />Published</span>
            </div>
          </div>
          <ul className="divide-y divide-[var(--color-border)]">
            {pipeline.map((row) => {
              const total = row.pending + row.approved + row.written + row.published;
              const segments = [
                { count: row.pending, color: "#f59e0b", label: "Pending" },
                { count: row.approved, color: "#6366f1", label: "Approved" },
                { count: row.written, color: "#8b5cf6", label: "Written" },
                { count: row.published, color: "#10b981", label: "Published" },
              ].filter((s) => s.count > 0);
              return (
                <li key={row.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--color-hover)] transition-colors">
                  <div className="w-36 sm:w-48 shrink-0 text-sm font-medium text-[var(--color-foreground)] truncate" title={row.name}>{row.name}</div>
                  <div className="flex-1 flex h-6 rounded-md overflow-hidden bg-[var(--color-hover)] min-w-0">
                    {segments.map((s) => (
                      <div
                        key={s.label}
                        title={`${s.label}: ${s.count}`}
                        className="flex items-center justify-center text-[11px] font-semibold text-white min-w-0 overflow-hidden transition-opacity hover:opacity-90"
                        style={{ flex: s.count, backgroundColor: s.color }}
                      >
                        {s.count}
                      </div>
                    ))}
                  </div>
                  <div className="w-10 shrink-0 text-right text-sm font-semibold text-[var(--color-foreground)] tabular-nums">{total}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

    </div>
  );
}
