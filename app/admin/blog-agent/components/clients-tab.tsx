"use client";

import { useState, useEffect, useCallback } from "react";
import type { Client } from "./types";
import type { ClientSiteProfile } from "@/lib/blog-agent/types";

export default function ClientsTab({
  clients,
  loading,
  onSeed,
  onAddClient,
  onDeleteClient,
  onToggleActive,
  onUpdateClient,
  onTestConnection,
  onResearch,
  onInstallerDownloaded,
}: {
  clients: Client[];
  loading: boolean;
  onSeed: () => void;
  onAddClient: (data: Record<string, unknown>) => void;
  onDeleteClient: (id: string) => void;
  onToggleActive: (client: Client) => void;
  onUpdateClient: (client: Client) => void;
  onTestConnection: (id: string) => void;
  onResearch: (clientId: string) => void;
  onInstallerDownloaded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Client>>({});
  const [profiles, setProfiles] = useState<Record<string, ClientSiteProfile>>({});
  const [analyzingClientId, setAnalyzingClientId] = useState<string | null>(null);
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set());
  const [downloadingInstaller, setDownloadingInstaller] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [connectionResults, setConnectionResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const handleCheckAll = async () => {
    setCheckingAll(true);
    setConnectionResults({});
    try {
      const res = await fetch("/api/blog-agent/test-all-connections", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(`Check failed: ${data.error || "Unknown error"}`);
        return;
      }
      const map: Record<string, { success: boolean; message: string }> = {};
      for (const r of data.results) map[r.id] = { success: r.success, message: r.message };
      setConnectionResults(map);
    } catch (err) {
      alert(`Check failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCheckingAll(false);
    }
  };

  const handleDownloadInstaller = async (client: Client) => {
    setDownloadingInstaller(client.id);
    try {
      const res = await fetch(`/api/blog-agent/clients/${client.id}/installer`);
      if (!res.ok) {
        const data = await res.json();
        alert(`Could not generate installer: ${data.error || "Unknown error"}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = client.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      a.href = url;
      a.download = `cs-publisher-${slug}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onInstallerDownloaded();
    } catch (err) {
      alert(`Download failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDownloadingInstaller(null);
    }
  };

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/blog-agent/clients/profiles");
      if (res.ok) setProfiles(await res.json());
    } catch {}
  }, []);

  const analyzeClient = async (clientId: string) => {
    setAnalyzingClientId(clientId);
    try {
      const res = await fetch(`/api/blog-agent/clients/${clientId}/profile`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setProfiles((prev) => ({ ...prev, [clientId]: data.profile }));
      } else {
        const data = await res.json();
        alert(`Analysis failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setAnalyzingClientId(null);
    }
  };

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const filtered = clients.filter((c) =>
    c.businessName.toLowerCase().includes(search.toLowerCase()) ||
    c.industry.toLowerCase().includes(search.toLowerCase()) ||
    c.location.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onAddClient({
      name: fd.get("name"),
      businessName: fd.get("businessName"),
      industry: fd.get("industry"),
      targetAudience: fd.get("targetAudience"),
      location: fd.get("location"),
      websiteUrl: fd.get("websiteUrl"),
      wordpressUrl: fd.get("wordpressUrl"),
      wordpressUsername: fd.get("wordpressUsername"),
      wordpressAppPassword: fd.get("wordpressAppPassword"),
      csPublisherSecret: fd.get("csPublisherSecret") || undefined,
      tone: fd.get("tone"),
      keywords: ((fd.get("keywords") as string) || "").split(",").map((k) => k.trim()).filter(Boolean),
      blogCategories: (fd.get("blogCategories") as string).split(",").map((c) => c.trim()).filter(Boolean),
      postsPerMonth: parseInt(fd.get("postsPerMonth") as string) || 2,
    });
    setShowAdd(false);
    e.currentTarget.reset();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)]"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {clients.length === 0 && (
            <button onClick={onSeed} disabled={loading} className="bg-[var(--color-success)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
              Load All 24 Clients
            </button>
          )}
          {clients.length > 0 && (
            <>
              <button
                onClick={handleCheckAll}
                disabled={checkingAll}
                title="Test WordPress connection for all clients at once"
                className="border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)] px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              >
                {checkingAll ? "Checking…" : "Check All"}
              </button>
            </>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
          >
            {showAdd ? "Cancel" : "+ Add Client"}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6 animate-slide-up">
          <h3 className="font-semibold text-[var(--color-foreground)] mb-4">New Client</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input name="name" label="Contact Name" placeholder="John Smith" required />
            <Input name="businessName" label="Business Name" placeholder="Acme Corp" required />
            <Input name="industry" label="Industry" placeholder="Plumbing, Real Estate, etc." required />
            <Input name="targetAudience" label="Target Audience" placeholder="Homeowners in Arizona" />
            <Input name="location" label="Location" placeholder="Arizona" />
            <Input name="websiteUrl" label="Website URL" placeholder="https://example.com" />
            <Input name="wordpressUrl" label="WordPress URL" placeholder="https://example.com" required />
            <Input name="wordpressUsername" label="WP Username" placeholder="admin (not needed for CS Publisher)" />
            <Input name="wordpressAppPassword" label="WP App Password" placeholder="Leave blank if using CS Publisher" type="password" />
            <Input name="csPublisherSecret" label="CS Publisher Secret (optional)" placeholder="Only if the cs-publisher mu-plugin is installed" type="password" />
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Tone</label>
              <select name="tone" className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]">
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
                <option value="authoritative">Authoritative</option>
                <option value="conversational">Conversational</option>
              </select>
            </div>
            <Input name="blogCategories" label="Blog Categories" placeholder="Tips, News, Guides" />
            <Input name="postsPerMonth" label="Posts Per Month" placeholder="1" type="number" />
          </div>
          <button type="submit" className="mt-4 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Add Client
          </button>
        </form>
      )}

      {/* Check-all results summary */}
      {Object.keys(connectionResults).length > 0 && (() => {
        const all = Object.values(connectionResults);
        const passed = all.filter((r) => r.success).length;
        const failed = all.length - passed;
        return (
          <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${passed === all.length ? "bg-[var(--color-success)]/10 border-[var(--color-success)]/40 text-[var(--color-success)]" : "bg-[var(--color-destructive)]/10 border-[var(--color-destructive)]/40 text-[var(--color-destructive)]"}`}>
            {passed === all.length
              ? `All ${passed} sites connected successfully`
              : `${passed} connected · ${failed} failed — scroll down to see which ones (red cards)`}
          </div>
        );
      })()}

      {/* Client grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((client) => {
          const connResult = connectionResults[client.id];
          const borderClass = connResult
            ? connResult.success
              ? "border-[var(--color-success)]/50"
              : "border-[var(--color-destructive)]/50"
            : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30";

          return (
          <div key={client.id} className={`bg-[var(--color-card)] border rounded-xl p-5 transition-all duration-200 group ${borderClass}`}>
            {/* Name + toggle */}
            <div className="flex items-start justify-between gap-2 mb-0.5">
              <h3 className="font-semibold text-[var(--color-foreground)] leading-snug">{client.businessName}</h3>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input type="checkbox" checked={client.isActive} onChange={() => onToggleActive(client)} className="sr-only peer" />
                <div className="w-8 h-[18px] bg-[var(--color-muted)] peer-checked:bg-[var(--color-success)] rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:after:translate-x-[14px]" />
              </label>
            </div>

            {/* Subtitle */}
            <p className="text-xs text-[var(--color-muted-foreground)] mb-3">
              {client.industry} &middot; {client.location} &middot; {client.tone}
            </p>

            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {client.hasCsPublisherSecret ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/30">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  CS Plugin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/30">
                  Stored creds
                </span>
              )}

              {connResult && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${connResult.success ? "bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]/30" : "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)] border-[var(--color-destructive)]/30"}`}>
                  {connResult.success ? (
                    <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  ) : (
                    <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                  )}
                  {connResult.success ? "Connected" : "Failed"}
                </span>
              )}
            </div>

            {/* Full error message — shown only when there's a failure */}
            {connResult && !connResult.success && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-destructive)]/8 border border-[var(--color-destructive)]/20">
                <p className="text-[11px] text-[var(--color-destructive)] leading-relaxed break-words">
                  {connResult.message}
                </p>
              </div>
            )}
            {connResult && connResult.success && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-success)]/8 border border-[var(--color-success)]/20">
                <p className="text-[11px] text-[var(--color-success)] leading-relaxed break-words">
                  {connResult.message}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
              {/* Row 1 — settings-style links */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    setEditingClient(editingClient === client.id ? null : client.id);
                    setEditDraft({ wordpressUrl: client.wordpressUrl, wordpressUsername: client.wordpressUsername, wordpressAppPassword: "", csPublisherSecret: "", name: client.name, businessName: client.businessName, industry: client.industry, targetAudience: client.targetAudience, location: client.location, websiteUrl: client.websiteUrl, tone: client.tone, blogCategories: client.blogCategories, postsPerMonth: client.postsPerMonth });
                  }}
                  className={`text-xs font-medium transition-colors ${editingClient === client.id ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"}`}
                >
                  Edit
                </button>
                <span className="text-[var(--color-border)]">|</span>
                <button onClick={() => onTestConnection(client.id)} className="text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors">
                  Test WP
                </button>
                <button
                  onClick={() => onDeleteClient(client.id)}
                  className="text-xs font-medium text-[var(--color-destructive)] hover:opacity-70 transition-colors ml-auto opacity-0 group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>
              {/* Row 2 — action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadInstaller(client)}
                  disabled={downloadingInstaller === client.id}
                  title="Download a ready-to-upload WordPress plugin zip for this client"
                  className="flex-1 text-xs font-medium py-1.5 px-3 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)] disabled:opacity-40 transition-colors text-center"
                >
                  {downloadingInstaller === client.id ? "Generating…" : "Get Plugin"}
                </button>
                <button
                  onClick={() => onResearch(client.id)}
                  disabled={loading}
                  className="flex-1 text-xs font-medium py-1.5 px-3 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-40 transition-all text-center"
                >
                  Research
                </button>
              </div>
            </div>

            {/* Edit client form */}
            {editingClient === client.id && (
              <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-3 animate-slide-up">
                <h4 className="text-xs font-semibold text-[var(--color-foreground)] uppercase tracking-wider">WordPress Credentials</h4>
                <div className="grid grid-cols-1 gap-3">
                  <EditInput label="WordPress URL" value={editDraft.wordpressUrl || ""} onChange={(v) => setEditDraft({ ...editDraft, wordpressUrl: v })} placeholder="https://example.com" />
                  <EditInput label="WP Username" value={editDraft.wordpressUsername || ""} onChange={(v) => setEditDraft({ ...editDraft, wordpressUsername: v })} placeholder="admin" />
                  <EditInput label="WP App Password" value={editDraft.wordpressAppPassword || ""} onChange={(v) => setEditDraft({ ...editDraft, wordpressAppPassword: v })} placeholder="Leave blank to keep current" type="password" />
                  <EditInput label="CS Publisher Secret" value={editDraft.csPublisherSecret || ""} onChange={(v) => setEditDraft({ ...editDraft, csPublisherSecret: v })} placeholder={client.hasCsPublisherSecret ? "Leave blank to keep current" : "Paste mu-plugin secret here"} type="password" />
                </div>
                <h4 className="text-xs font-semibold text-[var(--color-foreground)] uppercase tracking-wider pt-2">Client Details</h4>
                <div className="grid grid-cols-1 gap-3">
                  <EditInput label="Contact Name" value={editDraft.name || ""} onChange={(v) => setEditDraft({ ...editDraft, name: v })} />
                  <EditInput label="Business Name" value={editDraft.businessName || ""} onChange={(v) => setEditDraft({ ...editDraft, businessName: v })} />
                  <EditInput label="Industry" value={editDraft.industry || ""} onChange={(v) => setEditDraft({ ...editDraft, industry: v })} />
                  <EditInput label="Target Audience" value={editDraft.targetAudience || ""} onChange={(v) => setEditDraft({ ...editDraft, targetAudience: v })} />
                  <EditInput label="Location" value={editDraft.location || ""} onChange={(v) => setEditDraft({ ...editDraft, location: v })} />
                  <EditInput label="Website URL" value={editDraft.websiteUrl || ""} onChange={(v) => setEditDraft({ ...editDraft, websiteUrl: v })} />
                  <div>
                    <label className="block text-[10px] font-medium text-[var(--color-muted-foreground)] mb-1">Tone</label>
                    <select value={editDraft.tone || "professional"} onChange={(e) => setEditDraft({ ...editDraft, tone: e.target.value })} className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-foreground)]">
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="friendly">Friendly</option>
                      <option value="authoritative">Authoritative</option>
                      <option value="conversational">Conversational</option>
                    </select>
                  </div>
                  <EditInput label="Blog Categories" value={editDraft.blogCategories?.join(", ") || ""} onChange={(v) => setEditDraft({ ...editDraft, blogCategories: v.split(",").map((c) => c.trim()).filter(Boolean) })} placeholder="Tips, News, Guides" />
                  <EditInput label="Posts Per Month" value={String(editDraft.postsPerMonth || 1)} onChange={(v) => setEditDraft({ ...editDraft, postsPerMonth: parseInt(v) || 1 })} type="number" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      onUpdateClient({
                        ...client,
                        ...editDraft,
                        updatedAt: new Date().toISOString(),
                      } as Client);
                      setEditingClient(null);
                    }}
                    className="text-xs font-medium px-4 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 transition-all"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingClient(null)}
                    className="text-xs font-medium px-4 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Site Profile — collapsible */}
            {(() => {
              const profile = profiles[client.id];
              const isExpanded = expandedProfiles.has(client.id);
              const toggle = () => setExpandedProfiles((prev) => {
                const next = new Set(prev);
                next.has(client.id) ? next.delete(client.id) : next.add(client.id);
                return next;
              });
              const analyzedAgo = profile?.analyzedAt
                ? (() => {
                    const diff = Date.now() - new Date(profile.analyzedAt).getTime();
                    const days = Math.floor(diff / 86400000);
                    if (days < 1) return "today";
                    if (days === 1) return "1 day ago";
                    return `${days} days ago`;
                  })()
                : null;
              return (
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={toggle}
                      className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                    >
                      <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      {profile ? `Site analysis · ${analyzedAgo}` : "Site analysis · none yet"}
                    </button>
                    {profile ? (
                      <button
                        onClick={() => analyzeClient(client.id)}
                        disabled={analyzingClientId === client.id}
                        className="text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-40 transition-colors"
                      >
                        {analyzingClientId === client.id ? "Analyzing…" : "Refresh"}
                      </button>
                    ) : (
                      <button
                        onClick={() => analyzeClient(client.id)}
                        disabled={analyzingClientId === client.id}
                        className="text-[10px] font-medium text-[var(--color-primary)] hover:opacity-70 disabled:opacity-40 transition-colors"
                      >
                        {analyzingClientId === client.id ? "Analyzing…" : "Analyze Now"}
                      </button>
                    )}
                  </div>
                  {isExpanded && profile && (
                    <div className="mt-2 space-y-2">
                      {profile.summary && (
                        <p className="text-[11px] text-[var(--color-foreground)] leading-relaxed">{profile.summary}</p>
                      )}
                      {profile.keywords?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {profile.keywords.slice(0, 6).map((kw) => (
                            <span key={kw} className="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]">
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {isExpanded && !profile && (
                    <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)] italic">
                      No site analysis yet — will auto-run on first research, or click Analyze Now above.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
          );
        })}
      </div>

      {filtered.length === 0 && clients.length > 0 && (
        <p className="text-[var(--color-muted-foreground)] text-center py-12 text-sm">No clients match &quot;{search}&quot;</p>
      )}
      {clients.length === 0 && (
        <p className="text-[var(--color-muted-foreground)] text-center py-12 text-sm">No clients yet. Load the preset list or add one manually.</p>
      )}
    </div>
  );
}

function EditInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-[var(--color-muted-foreground)] mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)]" />
    </div>
  );
}

function Input({ name, label, placeholder, required, type = "text" }: { name: string; label: string; placeholder: string; required?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">{label}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)]" />
    </div>
  );
}
