"use client";

import { useState, useMemo } from "react";
import type { Client, Topic, Post } from "./types";

type SortMode = "default" | "volume" | "difficulty";

function formatMonth(m: string) {
  const [year, month] = m.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export default function TopicsTab({
  clients,
  topics,
  posts,
  loading,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
  onRegenerate,
  onWriteSelected,
}: {
  clients: Client[];
  topics: Topic[];
  posts: Post[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onBulkReject: (ids: string[]) => void;
  onRegenerate: (clientId: string) => void;
  onWriteSelected: (topicIds: string[]) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRationales, setExpandedRationales] = useState<Set<string>>(new Set());
  const [expandedPrevMonths, setExpandedPrevMonths] = useState<Set<string>>(new Set());

  const client = clients.find((c) => c.id === clientId);

  // Current calendar month — e.g. "2026-05" in May 2026.
  // Research ran last month and tagged topics with this month string.
  const currentMonth = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Topics that already have a post written (by topicId match).
  const writtenTopicIds = useMemo(
    () => new Set(posts.map((p) => p.topicId).filter(Boolean)),
    [posts]
  );

  // All topics for this client, sorted by chosen mode.
  const allClientTopics = useMemo(() => {
    if (!clientId) return [];
    const list = topics.filter((t) => t.clientId === clientId);
    if (sortMode === "volume") return [...list].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
    if (sortMode === "difficulty") return [...list].sort((a, b) => (a.keywordDifficulty ?? 999) - (b.keywordDifficulty ?? 999));
    return list;
  }, [topics, clientId, sortMode]);

  // Split into current month vs previous months.
  const currentMonthTopics = allClientTopics.filter((t) => !t.month || t.month === currentMonth);
  const currentPending  = currentMonthTopics.filter((t) => t.status === "pending");
  const currentApproved = currentMonthTopics.filter((t) => t.status === "approved");

  // Previous months: only approved/rejected show up here (pending are cleaned at research time).
  const prevMonthApproved = allClientTopics.filter((t) => t.status === "approved" && t.month && t.month < currentMonth);
  const prevMonths = useMemo(() => {
    const months = Array.from(new Set(prevMonthApproved.map((t) => t.month!)));
    return months.sort((a, b) => b.localeCompare(a)); // newest first
  }, [prevMonthApproved]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleRationale = (id: string) => {
    setExpandedRationales((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const togglePrevMonth = (m: string) => {
    setExpandedPrevMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllCurrentApproved = () => setSelectedIds(new Set(currentApproved.map((t) => t.id)));
  const selectedCount = currentApproved.filter((t) => selectedIds.has(t.id)).length;

  const resetClient = () => {
    setClientId("");
    clearSelection();
    setExpandedRationales(new Set());
    setExpandedPrevMonths(new Set());
  };

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {clientId && (
            <button
              onClick={resetClient}
              className="flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              All clients
            </button>
          )}
          <select
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); clearSelection(); setExpandedRationales(new Set()); setExpandedPrevMonths(new Set()); }}
            className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] min-w-[260px]"
          >
            <option value="">Select a client…</option>
            {[...clients].sort((a, b) => a.businessName.localeCompare(b.businessName)).map((c) => (
              <option key={c.id} value={c.id}>{c.businessName}</option>
            ))}
          </select>
        </div>
        {clientId && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-foreground)]"
            >
              <option value="default">Sort: default</option>
              <option value="volume">Sort: search volume (high → low)</option>
              <option value="difficulty">Sort: difficulty (easy → hard)</option>
            </select>
            <button
              onClick={() => onRegenerate(clientId)}
              disabled={loading}
              className="border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)] px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            >
              Research more topics
            </button>
          </div>
        )}
      </div>

      {/* ── Overview list (no client selected) ── */}
      {!clientId && (() => {
        const byClient = new Map<string, { clientId: string; clientName: string; pending: number; approved: number }>();
        for (const t of topics) {
          if (!byClient.has(t.clientId)) byClient.set(t.clientId, { clientId: t.clientId, clientName: t.clientName, pending: 0, approved: 0 });
          const entry = byClient.get(t.clientId)!;
          if (t.status === "pending") entry.pending++;
          else if (t.status === "approved") entry.approved++;
        }
        const rows = Array.from(byClient.values())
          .filter((r) => r.pending > 0 || r.approved > 0)
          .sort((a, b) => a.clientName.localeCompare(b.clientName));

        if (rows.length === 0) return (
          <div className="text-center py-20">
            <p className="text-[var(--color-muted-foreground)] text-sm">Select a client above — or go to the Clients tab and click &quot;Research&quot; to generate topic suggestions.</p>
          </div>
        );
        return (
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[var(--color-muted)]/40 border-b border-[var(--color-border)]">
              <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Clients with topics ({rows.length})</h3>
              <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">Click a client to view their topics.</p>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <button key={row.clientId} onClick={() => { setClientId(row.clientId); clearSelection(); setExpandedRationales(new Set()); }}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-hover)] transition-colors text-left">
                  <span className="text-sm font-medium text-[var(--color-foreground)] truncate">{row.clientName}</span>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    {row.pending > 0 && <span className="text-[var(--color-warning)]"><span className="font-semibold">{row.pending}</span> pending</span>}
                    {row.approved > 0 && <span className="text-[var(--color-muted-foreground)]"><span className="font-semibold">{row.approved}</span> approved</span>}
                    <svg className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Client header ── */}
      {clientId && client && (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-foreground)]">{client.businessName}</h2>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{client.industry} · {client.location} · {client.postsPerMonth} {client.postsPerMonth === 1 ? "post" : "posts"}/month</p>
            </div>
            <div className="flex gap-4 text-xs">
              {currentPending.length > 0 && <div><span className="font-semibold text-[var(--color-warning)]">{currentPending.length}</span> <span className="text-[var(--color-muted-foreground)]">to review</span></div>}
              {currentApproved.length > 0 && <div><span className="font-semibold text-[var(--color-primary)]">{currentApproved.length}</span> <span className="text-[var(--color-muted-foreground)]">to write</span></div>}
              {prevMonths.length > 0 && <div><span className="font-semibold text-[var(--color-muted-foreground)]">{prevMonthApproved.length}</span> <span className="text-[var(--color-muted-foreground)]">prev months</span></div>}
            </div>
          </div>
        </div>
      )}

      {/* ══ THIS MONTH ══════════════════════════════════════════════════════════ */}
      {clientId && (currentPending.length > 0 || currentApproved.length > 0) && (
        <div className="space-y-3">
          {/* Month label */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-foreground)] uppercase tracking-wider">{formatMonth(currentMonth)}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">This month</span>
          </div>

          {/* Pending approval */}
          {currentPending.length > 0 && (
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-[var(--color-muted)]/40 border-b border-[var(--color-border)]">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Researched — Pending your approval ({currentPending.length})</h3>
                  <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">Review these topics and approve the one you want written this month.</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => onBulkApprove(currentPending.map((t) => t.id))} className="text-xs font-medium text-[var(--color-success)] hover:underline">Approve all</button>
                  <button onClick={() => onBulkReject(currentPending.map((t) => t.id))} className="text-xs font-medium text-[var(--color-destructive)] hover:underline">Reject all</button>
                </div>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {currentPending.map((topic) => (
                  <TopicRow key={topic.id} topic={topic} showActions onApprove={onApprove} onReject={onReject}
                    rationaleExpanded={expandedRationales.has(topic.id)} onToggleRationale={() => toggleRationale(topic.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Approved — ready to write */}
          {currentApproved.length > 0 && (
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-[var(--color-success)]/5 border-b border-[var(--color-border)]">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--color-success)] uppercase tracking-wider">Approved — Write these ({currentApproved.length})</h3>
                  <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">These topics are approved for this month. Select and write, or use Write Posts in the Posts tab.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedCount > 0 ? (
                    <>
                      <button onClick={clearSelection} className="text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">Clear</button>
                      <button onClick={() => { onWriteSelected(Array.from(selectedIds)); clearSelection(); }} disabled={loading}
                        className="text-xs font-medium bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40">
                        Write Selected ({selectedCount})
                      </button>
                    </>
                  ) : (
                    <button onClick={selectAllCurrentApproved} className="text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">Select all</button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {currentApproved.map((topic) => (
                  <TopicRow key={topic.id} topic={topic}
                    selected={selectedIds.has(topic.id)} onToggleSelect={() => toggleSelect(topic.id)}
                    isWritten={writtenTopicIds.has(topic.id)}
                    onApprove={onApprove} onReject={onReject}
                    rationaleExpanded={expandedRationales.has(topic.id)} onToggleRationale={() => toggleRationale(topic.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ PREVIOUS MONTHS ═════════════════════════════════════════════════════ */}
      {clientId && prevMonths.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-muted-foreground)] uppercase tracking-wider">Previous months</span>
            <span className="text-[10px] text-[var(--color-muted-foreground)]">({prevMonthApproved.length} approved topics)</span>
          </div>
          {prevMonths.map((m) => {
            const monthTopics = prevMonthApproved.filter((t) => t.month === m);
            const writtenCount = monthTopics.filter((t) => writtenTopicIds.has(t.id)).length;
            const isOpen = expandedPrevMonths.has(m);
            return (
              <div key={m} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                <button onClick={() => togglePrevMonth(m)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-hover)] transition-colors">
                  <div className="flex items-center gap-2">
                    <svg className={`w-3.5 h-3.5 text-[var(--color-muted-foreground)] transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium text-[var(--color-foreground)]">{formatMonth(m)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {writtenCount > 0 && (
                      <span className="text-[var(--color-success)]">✓ {writtenCount} written</span>
                    )}
                    {monthTopics.length - writtenCount > 0 && (
                      <span className="text-[var(--color-muted-foreground)]">{monthTopics.length - writtenCount} not written</span>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                    {monthTopics.map((topic) => (
                      <TopicRow key={topic.id} topic={topic}
                        isWritten={writtenTopicIds.has(topic.id)}
                        onApprove={onApprove} onReject={onReject}
                        rationaleExpanded={expandedRationales.has(topic.id)} onToggleRationale={() => toggleRationale(topic.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {clientId && currentPending.length === 0 && currentApproved.length === 0 && prevMonths.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[var(--color-muted-foreground)] text-sm">
            No topics yet for this client. Click <span className="text-[var(--color-foreground)] font-medium">&quot;Research more topics&quot;</span> above to generate suggestions.
          </p>
        </div>
      )}
    </div>
  );
}

function TopicRow({
  topic,
  showActions,
  selected,
  onToggleSelect,
  isWritten,
  rationaleExpanded,
  onToggleRationale,
  onApprove,
  onReject,
}: {
  topic: Topic;
  showActions?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  isWritten?: boolean;
  rationaleExpanded: boolean;
  onToggleRationale: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const tooltipParts: string[] = [];
  if (topic.topicalCluster) tooltipParts.push(`Cluster: ${topic.topicalCluster}`);
  if (topic.targetKeywords?.length) tooltipParts.push(`Keywords: ${topic.targetKeywords.join(", ")}`);
  if (topic.supportsCommercialKeyword) tooltipParts.push(`Supports: ${topic.supportsCommercialKeyword}`);
  if (topic.internalLinkTarget) tooltipParts.push(`Internal link → ${topic.internalLinkTarget}`);
  if (typeof topic.cpc === "number" && topic.cpc > 0) tooltipParts.push(`CPC: $${topic.cpc.toFixed(2)}`);
  const tooltip = tooltipParts.join("\n");

  return (
    <div className={`px-5 py-3 transition-colors ${selected ? "bg-[var(--color-primary)]/5" : "hover:bg-[var(--color-hover)]"}`}>
      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <input type="checkbox" checked={!!selected} onChange={onToggleSelect}
            className="mt-1 w-4 h-4 shrink-0 cursor-pointer accent-[var(--color-primary)]" />
        )}
        <div className="flex-1 min-w-0" title={tooltip || undefined}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[var(--color-foreground)] leading-snug">{topic.title}</p>
            {isWritten && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-success)]/15 text-[var(--color-success)] font-medium shrink-0">✓ Written</span>
            )}
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 line-clamp-2">{topic.description}</p>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {typeof topic.searchVolume === "number" ? (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                topic.searchVolume >= 1000 ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                topic.searchVolume >= 100  ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                                             "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
              }`} title="Real monthly search volume (SEMrush)">
                {topic.searchVolume.toLocaleString()}/mo
              </span>
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                topic.estimatedSearchVolume === "high"   ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                topic.estimatedSearchVolume === "medium" ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                                                          "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
              }`} title="LLM-estimated volume (no SEMrush data)">
                ~{topic.estimatedSearchVolume} vol
              </span>
            )}
            {typeof topic.keywordDifficulty === "number" && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                topic.keywordDifficulty < 30  ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                topic.keywordDifficulty <= 55 ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                                                "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
              }`} title="Keyword difficulty 0-100 (SEMrush)">
                KD {topic.keywordDifficulty.toFixed(0)}
              </span>
            )}
            {topic.funnelStage && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                topic.funnelStage === "TOFU" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                topic.funnelStage === "MOFU" ? "bg-purple-500/15 text-purple-600 dark:text-purple-400" :
                                               "bg-orange-500/15 text-orange-600 dark:text-orange-400"
              }`} title="Funnel stage">
                {topic.funnelStage}
              </span>
            )}
            {topic.seoRationale && (
              <button onClick={onToggleRationale}
                className="text-[10px] px-2 py-0.5 rounded-full text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)] underline-offset-2 hover:underline">
                {rationaleExpanded ? "Hide why" : "Why?"}
              </button>
            )}
          </div>
          {rationaleExpanded && topic.seoRationale && (
            <div className="mt-2 px-3 py-2 bg-[var(--color-muted)]/60 border-l-2 border-[var(--color-primary)] rounded">
              <p className="text-xs text-[var(--color-foreground)]">{topic.seoRationale}</p>
            </div>
          )}
        </div>

        {showActions ? (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onApprove(topic.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-success)] text-[var(--color-primary-foreground)] hover:opacity-90 transition-opacity">Approve</button>
            <button onClick={() => onReject(topic.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] hover:border-[var(--color-destructive)] transition-all">Reject</button>
          </div>
        ) : (
          <button onClick={() => onReject(topic.id)} title="Remove from approved"
            className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] hover:border-[var(--color-destructive)] transition-all">
            Reject
          </button>
        )}
      </div>
    </div>
  );
}
