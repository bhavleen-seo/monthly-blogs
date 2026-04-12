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
}: {
  clients: Client[];
  topics: Topic[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onRegenerate: (clientId: string) => void;
}) {
  const [clientFilter, setClientFilter] = useState("");

  const filtered = clientFilter ? topics.filter((t) => t.clientId === clientFilter) : topics;
  const pending = filtered.filter((t) => t.status === "pending");
  const approved = filtered.filter((t) => t.status === "approved");
  const rejected = filtered.filter((t) => t.status === "rejected");

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

      {/* Approved */}
      {approved.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Approved ({approved.length})</h3>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border)]">
            {approved.map((topic) => (
              <TopicRow key={topic.id} topic={topic} onApprove={onApprove} onReject={onReject} />
            ))}
          </div>
        </div>
      )}

      {/* Rejected */}
      {rejected.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Rejected ({rejected.length})</h3>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border)]">
            {rejected.map((topic) => (
              <TopicRow key={topic.id} topic={topic} onApprove={onApprove} onReject={onReject} />
            ))}
          </div>
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

function TopicRow({ topic, onApprove, onReject, showActions }: { topic: Topic; onApprove: (id: string) => void; onReject: (id: string) => void; showActions?: boolean }) {
  return (
    <div className="px-5 py-4 hover:bg-[var(--color-hover)] transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-foreground)]">{topic.title}</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-1 line-clamp-2">{topic.description}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]">{topic.clientName}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]">{topic.month}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              topic.estimatedSearchVolume === "high" ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" :
              topic.estimatedSearchVolume === "medium" ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" :
              "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]"
            }`}>
              {topic.estimatedSearchVolume}
            </span>
            {topic.targetKeywords.slice(0, 3).map((kw) => (
              <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]">{kw}</span>
            ))}
          </div>
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
