"use client";

import { useState } from "react";
import type { Client, Topic } from "./types";

export default function TopicsTab({
  clients,
  topics,
  loading,
  onApprove,
  onReject,
  onBulkApprove,
  onRegenerate,
  onWriteSelected,
}: {
  clients: Client[];
  topics: Topic[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onRegenerate: (clientId: string) => void;
  onWriteSelected: (topicIds: string[]) => void;
}) {
  const [clientFilter, setClientFilter] = useState("");
  const [approvedExpanded, setApprovedExpanded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = clientFilter ? topics.filter((t) => t.clientId === clientFilter) : topics;
  const pending = filtered.filter((t) => t.status === "pending");
  const approved = filtered.filter((t) => t.status === "approved");

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllApproved = () => setSelectedIds(new Set(approved.map((t) => t.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const selectedCount = approved.filter((t) => selectedIds.has(t.id)).length;

  // Group pending by client
  const pendingByClient = new Map<string, { clientName: string; clientId: string; topics: Topic[] }>();
  pending.forEach((t) => {
    if (!pendingByClient.has(t.clientId)) {
      pendingByClient.set(t.clientId, { clientName: t.clientName, clientId: t.clientId, topics: [] });
    }
    pendingByClient.get(t.clientId)!.topics.push(t);
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] min-w-[200px]"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.businessName}</option>
            ))}
          </select>
          {pending.length > 0 && (
            <span className="text-xs text-[var(--color-muted-foreground)]">{pending.length} pending</span>
          )}
        </div>
        {pending.length > 0 && (
          <button
            onClick={() => onBulkApprove(pending.map((t) => t.id))}
            className="bg-[var(--color-success)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
          >
            Approve All ({pending.length})
          </button>
        )}
      </div>

      {/* Pending grouped by client */}
      {pendingByClient.size > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Pending</h3>
          {Array.from(pendingByClient.values()).map((group) => (
            <div key={group.clientId} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-[var(--color-muted)]/50 border-b border-[var(--color-border)]">
                <span className="text-sm font-medium text-[var(--color-foreground)]">{group.clientName} <span className="text-[var(--color-muted-foreground)] font-normal">({group.topics.length})</span></span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onBulkApprove(group.topics.map((t) => t.id))}
                    className="text-xs font-medium text-[var(--color-success)] hover:underline"
                  >
                    Approve All
                  </button>
                  <button
                    onClick={() => onRegenerate(group.clientId)}
                    disabled={loading}
                    className="text-xs font-medium text-[var(--color-warning)] hover:underline disabled:opacity-40"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {group.topics.map((topic) => (
                  <TopicRow key={topic.id} topic={topic} onApprove={onApprove} onReject={onReject} showActions />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approved — collapsible with checkbox selection */}
      {approved.length > 0 && (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <button
              onClick={() => setApprovedExpanded(!approvedExpanded)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <svg
                className={`w-4 h-4 text-[var(--color-muted-foreground)] transition-transform ${approvedExpanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
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
                    <button
                      onClick={clearSelection}
                      className="text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => {
                        onWriteSelected(Array.from(selectedIds));
                        clearSelection();
                      }}
                      disabled={loading}
                      className="text-xs font-medium bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40"
                    >
                      Write Selected ({selectedCount})
                    </button>
                  </>
                ) : (
                  <button
                    onClick={selectAllApproved}
                    className="text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  >
                    Select all
                  </button>
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
                  onApprove={onApprove}
                  onReject={onReject}
                  selected={selectedIds.has(topic.id)}
                  onToggleSelect={() => toggleSelect(topic.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {topics.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[var(--color-muted-foreground)] text-sm">No topics yet. Go to Clients and click Research to generate suggestions.</p>
        </div>
      )}
    </div>
  );
}

function TopicRow({
  topic,
  onApprove,
  onReject,
  showActions,
  selected,
  onToggleSelect,
}: {
  topic: Topic;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  showActions?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  return (
    <div className={`px-5 py-4 transition-colors ${selected ? "bg-[var(--color-primary)]/5" : "hover:bg-[var(--color-hover)]"}`}>
      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="mt-1 w-4 h-4 shrink-0 cursor-pointer accent-[var(--color-primary)]"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-foreground)]">{topic.title}</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-1 line-clamp-2">{topic.description}</p>
          {topic.seoRationale && (
            <div className="mt-2 px-3 py-2 bg-[var(--color-muted)]/60 border-l-2 border-[var(--color-primary)] rounded">
              <p className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-0.5">SEO Rationale</p>
              <p className="text-xs text-[var(--color-foreground)]">{topic.seoRationale}</p>
            </div>
          )}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]">{topic.clientName}</span>
            {topic.topicalCluster && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium" title="Topical cluster">
                🎯 {topic.topicalCluster}
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
            {typeof topic.searchVolume === "number" ? (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  topic.searchVolume >= 1000 ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                  topic.searchVolume >= 100 ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                  "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
                }`}
                title="Real monthly search volume (SEMrush)"
              >
                {topic.searchVolume.toLocaleString()}/mo
              </span>
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                topic.estimatedSearchVolume === "high" ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                topic.estimatedSearchVolume === "medium" ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
              }`} title="LLM-estimated volume (no SEMrush data)">
                vol: ~{topic.estimatedSearchVolume}
              </span>
            )}
            {typeof topic.keywordDifficulty === "number" ? (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  topic.keywordDifficulty < 30 ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                  topic.keywordDifficulty <= 55 ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                  "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
                }`}
                title="Keyword difficulty 0-100 (SEMrush)"
              >
                KD {topic.keywordDifficulty.toFixed(0)}
              </span>
            ) : topic.rankingDifficulty ? (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                topic.rankingDifficulty === "easy" ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
                topic.rankingDifficulty === "medium" ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
                "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
              }`} title="LLM-estimated difficulty (no SEMrush data)">
                ~{topic.rankingDifficulty}
              </span>
            ) : null}
            {typeof topic.cpc === "number" && topic.cpc > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]" title="Cost per click (SEMrush)">
                ${topic.cpc.toFixed(2)}
              </span>
            )}
            {topic.targetKeywords.slice(0, 3).map((kw) => (
              <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]">{kw}</span>
            ))}
          </div>
          {(topic.supportsCommercialKeyword || topic.internalLinkTarget) && (
            <div className="mt-2 text-[10px] text-[var(--color-muted-foreground)] space-y-0.5">
              {topic.supportsCommercialKeyword && (
                <p>Supports: <span className="text-[var(--color-foreground)] font-medium">{topic.supportsCommercialKeyword}</span></p>
              )}
              {topic.internalLinkTarget && (
                <p className="truncate">Internal link → <span className="text-[var(--color-foreground)] font-mono">{topic.internalLinkTarget}</span></p>
              )}
            </div>
          )}
        </div>
        {showActions && (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onApprove(topic.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-success)] text-[var(--color-primary-foreground)] hover:opacity-90 transition-opacity">
              Approve
            </button>
            <button onClick={() => onReject(topic.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] hover:border-[var(--color-destructive)] transition-all">
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
