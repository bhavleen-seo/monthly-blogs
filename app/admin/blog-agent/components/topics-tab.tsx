"use client";

import { useState, useMemo } from "react";
import type { Client, Topic } from "./types";

type SortMode = "default" | "volume" | "difficulty";

export default function TopicsTab({
  clients,
  topics,
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
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onBulkReject: (ids: string[]) => void;
  onRegenerate: (clientId: string) => void;
  onWriteSelected: (topicIds: string[]) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRationales, setExpandedRationales] = useState<Set<string>>(new Set());
  const [approvedExpanded, setApprovedExpanded] = useState(true);

  const client = clients.find((c) => c.id === clientId);

  // All unique months across all topics for this client, sorted newest first.
  const availableMonths = useMemo(() => {
    if (!clientId) return [];
    const months = [...new Set(topics.filter((t) => t.clientId === clientId).map((t) => t.month).filter(Boolean))];
    return months.sort((a, b) => b.localeCompare(a));
  }, [topics, clientId]);

  const formatMonth = (m: string) => {
    const [year, month] = m.split("-");
    return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  };

  const sortedTopics = useMemo(() => {
    if (!clientId) return [];
    let list = topics.filter((t) => t.clientId === clientId);
    if (monthFilter !== "all") list = list.filter((t) => t.month === monthFilter);
    if (sortMode === "volume") {
      return [...list].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
    }
    if (sortMode === "difficulty") {
      return [...list].sort((a, b) => (a.keywordDifficulty ?? 999) - (b.keywordDifficulty ?? 999));
    }
    return list;
  }, [topics, clientId, monthFilter, sortMode]);

  const pending = sortedTopics.filter((t) => t.status === "pending");
  const approved = sortedTopics.filter((t) => t.status === "approved");

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleRationale = (id: string) => {
    setExpandedRationales((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllApproved = () => setSelectedIds(new Set(approved.map((t) => t.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const selectedCount = approved.filter((t) => selectedIds.has(t.id)).length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Client picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {clientId && (
            <button
              onClick={() => { setClientId(""); setMonthFilter("all"); clearSelection(); setExpandedRationales(new Set()); }}
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
            onChange={(e) => { setClientId(e.target.value); setMonthFilter("all"); clearSelection(); setExpandedRationales(new Set()); }}
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
            {availableMonths.length > 1 && (
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-foreground)]"
              >
                <option value="all">All months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            )}
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

      {/* Empty state — show clients that have topics so user can jump in */}
      {!clientId && (() => {
        // Build a mini-summary grouped by client, sorted by pending count desc.
        const byClient = new Map<string, { clientId: string; clientName: string; pending: number; approved: number }>();
        for (const t of topics) {
          if (!byClient.has(t.clientId)) {
            byClient.set(t.clientId, { clientId: t.clientId, clientName: t.clientName, pending: 0, approved: 0 });
          }
          const entry = byClient.get(t.clientId)!;
          if (t.status === "pending") entry.pending++;
          else if (t.status === "approved") entry.approved++;
        }
        const rows = Array.from(byClient.values())
          .filter((r) => r.pending > 0 || r.approved > 0)
          .sort((a, b) => a.clientName.localeCompare(b.clientName));

        if (rows.length === 0) {
          return (
            <div className="text-center py-20">
              <p className="text-[var(--color-muted-foreground)] text-sm">Select a client above — or go to the Clients tab and click &quot;Research&quot; on a client to generate topic suggestions.</p>
            </div>
          );
        }
        return (
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[var(--color-muted)]/40 border-b border-[var(--color-border)]">
              <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
                Clients with topics ({rows.length})
              </h3>
              <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">Click a client to view their pending/approved topics.</p>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <button
                  key={row.clientId}
                  onClick={() => { setClientId(row.clientId); clearSelection(); setExpandedRationales(new Set()); }}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-hover)] transition-colors text-left"
                >
                  <span className="text-sm font-medium text-[var(--color-foreground)] truncate">{row.clientName}</span>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    {row.pending > 0 && (
                      <span className="text-[var(--color-warning)]">
                        <span className="font-semibold">{row.pending}</span> pending
                      </span>
                    )}
                    {row.approved > 0 && (
                      <span className="text-[var(--color-muted-foreground)]">
                        <span className="font-semibold">{row.approved}</span> approved
                      </span>
                    )}
                    <svg className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Client summary + counts */}
      {clientId && client && (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-foreground)]">{client.businessName}</h2>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                {client.industry} · {client.location} · {client.postsPerMonth} {client.postsPerMonth === 1 ? "post" : "posts"}/month
              </p>
              {client.keywords?.length > 0 && (
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1.5">
                  Targeting: <span className="text-[var(--color-foreground)]">{client.keywords.join(", ")}</span>
                </p>
              )}
            </div>
            <div className="flex gap-4 text-xs">
              <div><span className="font-semibold text-[var(--color-foreground)]">{pending.length}</span> <span className="text-[var(--color-muted-foreground)]">pending</span></div>
              <div><span className="font-semibold text-[var(--color-foreground)]">{approved.length}</span> <span className="text-[var(--color-muted-foreground)]">approved</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Pending topics */}
      {clientId && pending.length > 0 && (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-[var(--color-muted)]/40 border-b border-[var(--color-border)]">
            <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
              Pending approval ({pending.length})
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onBulkApprove(pending.map((t) => t.id))}
                className="text-xs font-medium text-[var(--color-success)] hover:underline"
              >
                Approve all
              </button>
              <button
                onClick={() => onBulkReject(pending.map((t) => t.id))}
                className="text-xs font-medium text-[var(--color-destructive)] hover:underline"
              >
                Reject all
              </button>
            </div>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {pending.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                showActions
                onApprove={onApprove}
                onReject={onReject}
                rationaleExpanded={expandedRationales.has(topic.id)}
                onToggleRationale={() => toggleRationale(topic.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Approved topics */}
      {clientId && approved.length > 0 && (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <button
              onClick={() => setApprovedExpanded(!approvedExpanded)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <svg className={`w-4 h-4 text-[var(--color-muted-foreground)] transition-transform ${approvedExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
                Approved ({approved.length})
              </h3>
              {selectedCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">
                  {selectedCount} selected
                </span>
              )}
            </button>
            {approvedExpanded && (
              <div className="flex items-center gap-2">
                {selectedCount > 0 ? (
                  <>
                    <button onClick={clearSelection} className="text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">Clear</button>
                    <button
                      onClick={() => { onWriteSelected(Array.from(selectedIds)); clearSelection(); }}
                      disabled={loading}
                      className="text-xs font-medium bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40"
                    >
                      Write Selected ({selectedCount})
                    </button>
                  </>
                ) : (
                  <button onClick={selectAllApproved} className="text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">Select all</button>
                )}
              </div>
            )}
          </div>
          {approvedExpanded && (
            <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {approved.map((topic) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  selected={selectedIds.has(topic.id)}
                  onToggleSelect={() => toggleSelect(topic.id)}
                  rationaleExpanded={expandedRationales.has(topic.id)}
                  onToggleRationale={() => toggleRationale(topic.id)}
                  onApprove={onApprove}
                  onReject={onReject}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state for selected client with no topics */}
      {clientId && pending.length === 0 && approved.length === 0 && (
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
  rationaleExpanded,
  onToggleRationale,
  onApprove,
  onReject,
}: {
  topic: Topic;
  showActions?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  rationaleExpanded: boolean;
  onToggleRationale: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  // Tooltip text combining the secondary info that we don't show as badges anymore.
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
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="mt-1 w-4 h-4 shrink-0 cursor-pointer accent-[var(--color-primary)]"
          />
        )}
        <div className="flex-1 min-w-0" title={tooltip || undefined}>
          <p className="text-sm font-medium text-[var(--color-foreground)] leading-snug">{topic.title}</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 line-clamp-2">{topic.description}</p>

          {/* Compact badge row — only the 4 essentials */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {/* Search volume */}
            {typeof topic.searchVolume === "number" ? (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  topic.searchVolume >= 1000 ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                  topic.searchVolume >= 100  ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                                               "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
                }`}
                title="Real monthly search volume (SEMrush)"
              >
                {topic.searchVolume.toLocaleString()}/mo
              </span>
            ) : (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  topic.estimatedSearchVolume === "high"   ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                  topic.estimatedSearchVolume === "medium" ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                                                            "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
                }`}
                title="LLM-estimated volume (no SEMrush data)"
              >
                ~{topic.estimatedSearchVolume} vol
              </span>
            )}

            {/* Difficulty */}
            {typeof topic.keywordDifficulty === "number" && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  topic.keywordDifficulty < 30  ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                  topic.keywordDifficulty <= 55 ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                                                  "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
                }`}
                title="Keyword difficulty 0-100 (SEMrush)"
              >
                KD {topic.keywordDifficulty.toFixed(0)}
              </span>
            )}

            {/* Funnel stage */}
            {topic.funnelStage && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  topic.funnelStage === "TOFU" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                  topic.funnelStage === "MOFU" ? "bg-purple-500/15 text-purple-600 dark:text-purple-400" :
                                                 "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                }`}
                title="Funnel stage"
              >
                {topic.funnelStage}
              </span>
            )}

            {/* Why? expander for SEO rationale */}
            {topic.seoRationale && (
              <button
                onClick={onToggleRationale}
                className="text-[10px] px-2 py-0.5 rounded-full text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)] underline-offset-2 hover:underline"
              >
                {rationaleExpanded ? "Hide why" : "Why?"}
              </button>
            )}
          </div>

          {/* Expandable SEO Rationale */}
          {rationaleExpanded && topic.seoRationale && (
            <div className="mt-2 px-3 py-2 bg-[var(--color-muted)]/60 border-l-2 border-[var(--color-primary)] rounded">
              <p className="text-xs text-[var(--color-foreground)]">{topic.seoRationale}</p>
            </div>
          )}
        </div>

        {showActions ? (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onApprove(topic.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-success)] text-[var(--color-primary-foreground)] hover:opacity-90 transition-opacity">
              Approve
            </button>
            <button onClick={() => onReject(topic.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] hover:border-[var(--color-destructive)] transition-all">
              Reject
            </button>
          </div>
        ) : (
          <button
            onClick={() => onReject(topic.id)}
            title="Remove from approved"
            className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] hover:border-[var(--color-destructive)] transition-all"
          >
            Reject
          </button>
        )}
      </div>
    </div>
  );
}
