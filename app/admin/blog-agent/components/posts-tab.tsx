"use client";

import { useState, useEffect, useMemo } from "react";
import type { Client, Topic, Post } from "./types";

function generateSlugPreview(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const UNPUBLISHED_SECTIONS: { status: string; label: string }[] = [
  { status: "ready",  label: "Ready to Publish" },
  { status: "draft",  label: "Drafts" },
  { status: "failed", label: "Failed" },
];

export default function PostsTab({
  clients,
  topics,
  posts,
  loading,
  onWritePosts,
  onPublishPosts,
  onPublishPost,
  onPostUpdated,
  onDeletePost,
  onRewritePost,
  onCleanupPosts,
  onBackfillImages,
}: {
  clients: Client[];
  topics: Topic[];
  posts: Post[];
  loading: boolean;
  onWritePosts: (clientId: string) => void;
  onPublishPosts: () => void;
  onPublishPost: (postId: string) => void;
  onPostUpdated: () => void;
  onDeletePost: (id: string) => void;
  onRewritePost: (postId: string) => void;
  onCleanupPosts: () => void;
  onBackfillImages: (postId?: string) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [publishedExpanded, setPublishedExpanded] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Post>>({});
  const [saving, setSaving] = useState(false);
  const [contentView, setContentView] = useState<"preview" | "html">("preview");

  const client = clients.find((c) => c.id === clientId);

  const clientPosts = useMemo(
    () => (clientId ? posts.filter((p) => p.clientId === clientId) : []),
    [posts, clientId]
  );
  // Target month = current calendar month (research ran last month and tagged
  // topics with the current month; writing and publishing happen this month).
  const targetMonth = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const clientApprovedTopics = useMemo(
    () => (clientId ? topics.filter((t) => t.clientId === clientId && t.status === "approved" && (!t.month || t.month === targetMonth)) : []),
    [topics, clientId, targetMonth]
  );

  const counts = {
    approvedTopics: clientApprovedTopics.length,
    ready:     clientPosts.filter((p) => p.status === "ready").length,
    drafts:    clientPosts.filter((p) => p.status === "draft").length,
    published: clientPosts.filter((p) => p.status === "published").length,
    failed:    clientPosts.filter((p) => p.status === "failed").length,
  };

  const publishedWithUrlCount = useMemo(
    () => posts.filter((p) => p.status === "published" && p.publishedUrl).length,
    [posts]
  );

  const missingImageCount = useMemo(
    () => posts.filter((p) => !p.featuredImageUrl).length,
    [posts]
  );

  // When the posts prop refreshes (e.g. after a backfill), sync selectedPost
  // so the modal reflects the latest data without needing to close and reopen.
  useEffect(() => {
    if (!selectedPost) return;
    const updated = posts.find((p) => p.id === selectedPost.id);
    if (updated && updated !== selectedPost) setSelectedPost(updated);
  }, [posts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset edit state when post changes
  useEffect(() => {
    if (selectedPost) {
      setDraft({
        title: selectedPost.title,
        h1: selectedPost.h1 || "",
        slug: selectedPost.slug || generateSlugPreview(selectedPost.title),
        content: selectedPost.content,
        metaDescription: selectedPost.metaDescription,
        featuredImageUrl: selectedPost.featuredImageUrl || "",
      });
      setEditing(false);
      setContentView("preview");
    }
  }, [selectedPost]);

  const copyField = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 2000);
  };

  const saveEdits = async () => {
    if (!selectedPost) return;
    setSaving(true);
    try {
      const res = await fetch("/api/blog-agent/posts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedPost.id, ...draft }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedPost({ ...selectedPost, ...data.post });
        setEditing(false);
        onPostUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Client picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {clientId && (
            <button
              onClick={() => { setClientId(""); setSelectedPost(null); }}
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
            onChange={(e) => setClientId(e.target.value)}
            className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] min-w-[260px]"
          >
            <option value="">Select a client…</option>
            {[...clients].sort((a, b) => a.businessName.localeCompare(b.businessName)).map((c) => (
              <option key={c.id} value={c.id}>{c.businessName}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href="/api/blog-agent/posts/export-published"
            className={`px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-hover)] transition-all ${
              publishedWithUrlCount === 0 ? "pointer-events-none opacity-40" : ""
            }`}
            title="Download a CSV with Client Name and Blog URL for every published post. Open it in Google Sheets via File → Import."
          >
            Export Published URLs ({publishedWithUrlCount})
          </a>
          {missingImageCount > 0 && (
            <button
              onClick={() => onBackfillImages()}
              disabled={loading}
              title="Search Freepik for featured images on all posts that don't have one yet"
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-hover)] transition-all disabled:opacity-40"
            >
              Fetch Missing Images ({missingImageCount})
            </button>
          )}
          {posts.some((p) => p.status !== "published") && (
            <button
              onClick={onCleanupPosts}
              title="Delete all draft and ready posts — only published posts are kept"
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-destructive)]/40 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 transition-all"
            >
              Delete Drafts ({posts.filter((p) => p.status !== "published").length})
            </button>
          )}
          {clientId && counts.approvedTopics > 0 && (
            <button
              onClick={() => onWritePosts(clientId)}
              disabled={loading}
              className="bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              Write Posts ({counts.approvedTopics})
            </button>
          )}
          {clientId && counts.ready > 0 && (
            <button
              onClick={onPublishPosts}
              disabled={loading}
              className="bg-[var(--color-success)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              Publish ({counts.ready})
            </button>
          )}
        </div>
      </div>

      {/* Empty state — show clients that have posts so user can jump in */}
      {!clientId && (() => {
        const byClient = new Map<string, { clientId: string; clientName: string; ready: number; drafts: number; published: number; failed: number }>();
        for (const p of posts) {
          if (!byClient.has(p.clientId)) {
            byClient.set(p.clientId, { clientId: p.clientId, clientName: p.clientName, ready: 0, drafts: 0, published: 0, failed: 0 });
          }
          const entry = byClient.get(p.clientId)!;
          if (p.status === "ready") entry.ready++;
          else if (p.status === "draft") entry.drafts++;
          else if (p.status === "published") entry.published++;
          else if (p.status === "failed") entry.failed++;
        }
        const rows = Array.from(byClient.values())
          .sort((a, b) => a.clientName.localeCompare(b.clientName));

        if (rows.length === 0) {
          return (
            <div className="text-center py-20">
              <p className="text-[var(--color-muted-foreground)] text-sm">Select a client above — or go to the Topics tab to approve topics, then write posts for them.</p>
            </div>
          );
        }
        return (
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[var(--color-muted)]/40 border-b border-[var(--color-border)]">
              <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
                Clients with posts ({rows.length})
              </h3>
              <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">Click a client to view their posts.</p>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <button
                  key={row.clientId}
                  onClick={() => setClientId(row.clientId)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-hover)] transition-colors text-left"
                >
                  <span className="text-sm font-medium text-[var(--color-foreground)] truncate">{row.clientName}</span>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    {row.failed > 0 && (
                      <span className="text-[var(--color-destructive)]">
                        <span className="font-semibold">{row.failed}</span> failed
                      </span>
                    )}
                    {row.ready > 0 && (
                      <span className="text-[var(--color-primary)]">
                        <span className="font-semibold">{row.ready}</span> ready
                      </span>
                    )}
                    {row.drafts > 0 && (
                      <span className="text-[var(--color-muted-foreground)]">
                        <span className="font-semibold">{row.drafts}</span> drafts
                      </span>
                    )}
                    {row.published > 0 && (
                      <span className="text-[var(--color-success)]">
                        <span className="font-semibold">{row.published}</span> published
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

      {/* Client summary + pipeline stats */}
      {clientId && client && (
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-foreground)]">{client.businessName}</h2>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                {client.industry} · {client.location} · {client.postsPerMonth} {client.postsPerMonth === 1 ? "post" : "posts"}/month
              </p>
            </div>
            <div className="flex gap-4 text-xs">
              <Stat label="approved topics" value={counts.approvedTopics} />
              <Stat label="ready" value={counts.ready} />
              <Stat label="drafts" value={counts.drafts} />
              <Stat label="published" value={counts.published} />
              {counts.failed > 0 && <Stat label="failed" value={counts.failed} tone="destructive" />}
            </div>
          </div>
        </div>
      )}

      {/* Unpublished section */}
      {clientId && (() => {
        const unpublished = clientPosts.filter((p) => p.status !== "published");
        if (unpublished.length === 0) return null;
        return (
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[var(--color-muted)]/40 border-b border-[var(--color-border)]">
              <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
                Unpublished ({unpublished.length})
              </h3>
              <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">These posts need to be published or are still being generated.</p>
            </div>
            {UNPUBLISHED_SECTIONS.map(({ status, label }) => {
              const items = clientPosts.filter((p) => p.status === status);
              if (items.length === 0) return null;
              return (
                <div key={status}>
                  <div className="px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-muted)]/20">
                    <p className="text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">{label} ({items.length})</p>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {items.map((post) => <PostRow key={post.id} post={post} loading={loading} onPreview={() => { setSelectedPost(post); setCopiedField(null); }} onPublish={() => onPublishPost(post.id)} onRewrite={() => onRewritePost(post.id)} onDelete={() => onDeletePost(post.id)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Published section — collapsible */}
      {clientId && (() => {
        const published = clientPosts.filter((p) => p.status === "published");
        if (published.length === 0) return null;
        return (
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <button
              onClick={() => setPublishedExpanded(!publishedExpanded)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-hover)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className={`w-4 h-4 text-[var(--color-muted-foreground)] transition-transform ${publishedExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
                  Published ({published.length})
                </h3>
              </div>
              <span className="text-[11px] text-[var(--color-success)]">✓ Live on WordPress</span>
            </button>
            {publishedExpanded && (
              <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {published.map((post) => <PostRow key={post.id} post={post} loading={loading} onPreview={() => { setSelectedPost(post); setCopiedField(null); }} onPublish={() => onPublishPost(post.id)} onRewrite={() => onRewritePost(post.id)} onDelete={() => onDeletePost(post.id)} />)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Empty state for selected client with no posts */}
      {clientId && clientPosts.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[var(--color-muted-foreground)] text-sm">
            {counts.approvedTopics > 0
              ? <>No posts yet. Click <span className="text-[var(--color-foreground)] font-medium">&quot;Write Posts&quot;</span> above to generate {counts.approvedTopics === 1 ? "a post" : `${counts.approvedTopics} posts`} from approved topics.</>
              : <>No posts yet. Approve some topics in the Topics tab first, then come back here to write them.</>}
          </p>
        </div>
      )}

      {/* Preview / edit modal */}
      {selectedPost && (() => {
        const displaySlug  = (editing ? draft.slug  : selectedPost.slug)  || generateSlugPreview(selectedPost.title);
        const displayH1    = (editing ? draft.h1    : selectedPost.h1)    || "";
        const displayTitle = editing ? (draft.title || "") : selectedPost.title;
        const displayMeta  = editing ? (draft.metaDescription || "") : selectedPost.metaDescription;
        const titleLen = displayTitle.length;
        const metaLen  = displayMeta.length;

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedPost(null)}>
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">{selectedPost.clientName}</p>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">·</span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">{selectedPost.wordCount} words</span>
                  <span className={`text-[10px] inline-flex items-center gap-1 ${
                    selectedPost.status === "published" ? "text-[var(--color-success)]" :
                    selectedPost.status === "ready"     ? "text-[var(--color-primary)]" :
                    selectedPost.status === "failed"    ? "text-[var(--color-destructive)]" :
                                                          "text-[var(--color-muted-foreground)]"
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />{selectedPost.status}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!editing && selectedPost.status !== "published" && (
                    <button
                      onClick={() => setEditing(true)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-all"
                    >
                      Edit
                    </button>
                  )}
                  {!editing && (
                    <button
                      onClick={() => copyField("content", selectedPost.content)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                        copiedField === "content"
                          ? "border-[var(--color-success)] text-[var(--color-success)]"
                          : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                      }`}
                    >
                      {copiedField === "content" ? "Copied!" : "Copy HTML"}
                    </button>
                  )}
                  <button onClick={() => setSelectedPost(null)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors text-xl leading-none">×</button>
                </div>
              </div>

              {/* Body */}
              <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
                {/* AI tells warning */}
                {selectedPost.aiTellsDetected && selectedPost.aiTellsDetected.length > 0 && (
                  <div className="bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/40 rounded-lg px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="text-[var(--color-warning)] text-base leading-none mt-0.5">⚠</span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-[var(--color-warning)] mb-1">AI-tell phrases detected — consider editing or rewriting</p>
                        <ul className="text-xs text-[var(--color-foreground)] space-y-0.5 list-disc pl-4">
                          {selectedPost.aiTellsDetected.map((tell) => (
                            <li key={tell}>{tell}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Featured image — moved to top */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Featured image</label>
                    {selectedPost.featuredImageUrl && !editing && (
                      <span className="text-[10px] text-[var(--color-success)]">auto-found from Freepik</span>
                    )}
                  </div>
                  {editing ? (
                    /* Edit mode — URL input + live preview */
                    <div className="space-y-2">
                      <input
                        type="url"
                        value={draft.featuredImageUrl || ""}
                        onChange={(e) => setDraft({ ...draft, featuredImageUrl: e.target.value })}
                        placeholder={selectedPost.featuredImagePrompt
                          ? `Search Freepik for: "${selectedPost.featuredImagePrompt.slice(0, 80)}"`
                          : "https://img.freepik.com/..."}
                        className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)]"
                      />
                      {draft.featuredImageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={draft.featuredImageUrl}
                          alt="Featured preview"
                          className="w-full max-h-64 object-cover rounded-lg border border-[var(--color-border)]"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                  ) : selectedPost.featuredImageUrl ? (
                    /* Read mode — image found, show it */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={selectedPost.featuredImageUrl}
                      alt="Featured"
                      className="w-full max-h-64 object-cover rounded-lg border border-[var(--color-border)]"
                    />
                  ) : (
                    /* Read mode — no image found */
                    <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--color-warning)]">No image found</p>
                        {selectedPost.featuredImagePrompt && (
                          <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5 truncate">
                            Will search: &ldquo;{selectedPost.featuredImagePrompt.slice(0, 80)}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button
                          onClick={() => { onBackfillImages(selectedPost.id); }}
                          disabled={loading}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-40 transition-opacity"
                        >
                          Auto-fetch
                        </button>
                        <button
                          onClick={() => setEditing(true)}
                          className="text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                        >
                          Paste URL
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedPost.featuredImageAlt && (
                    <div className="flex items-start justify-between gap-2 px-3 py-2 bg-[var(--color-muted)]/40 border border-[var(--color-border)] rounded-lg">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider mb-0.5">Suggested alt text</p>
                        <p className="text-xs text-[var(--color-foreground)]">{selectedPost.featuredImageAlt}</p>
                        <p className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5">Copy this into the WordPress media library after publishing for SEO.</p>
                      </div>
                      <button
                        onClick={() => copyField("alt", selectedPost.featuredImageAlt!)}
                        className={`text-[10px] font-medium px-2 py-1 rounded transition-all shrink-0 ${
                          copiedField === "alt"
                            ? "bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                            : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                        }`}
                      >
                        {copiedField === "alt" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>

                {/* SEO metadata — single clean labelled list */}
                <div className="bg-[var(--color-muted)]/40 rounded-lg divide-y divide-[var(--color-border)]">
                  <MetaRow
                    label="H1 heading"
                    value={displayH1}
                    placeholder={displayTitle}
                    editing={editing}
                    onChange={(v) => setDraft({ ...draft, h1: v })}
                    copyKey="h1"
                    copiedField={copiedField}
                    onCopy={() => copyField("h1", displayH1 || displayTitle)}
                  />
                  <MetaRow
                    label="Page title"
                    value={displayTitle}
                    editing={editing}
                    onChange={(v) => setDraft({ ...draft, title: v })}
                    copyKey="title"
                    copiedField={copiedField}
                    onCopy={() => copyField("title", displayTitle)}
                    counter={`${titleLen}/60`}
                    counterTone={titleLen <= 60 ? "ok" : "bad"}
                  />
                  <MetaRow
                    label="URL slug"
                    value={displaySlug}
                    mono
                    editing={editing}
                    onChange={(v) => setDraft({ ...draft, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") })}
                    copyKey="slug"
                    copiedField={copiedField}
                    onCopy={() => copyField("slug", displaySlug)}
                    prefix="/"
                  />
                  <MetaRow
                    label="Meta description"
                    value={displayMeta}
                    editing={editing}
                    onChange={(v) => setDraft({ ...draft, metaDescription: v })}
                    copyKey="meta"
                    copiedField={copiedField}
                    onCopy={() => copyField("meta", displayMeta)}
                    counter={`${metaLen}/160`}
                    counterTone={metaLen >= 140 && metaLen <= 160 ? "ok" : "muted"}
                    multiline
                  />
                </div>

                {/* Content */}
                <div>
                  <div className="flex items-center gap-1 mb-2">
                    <button
                      onClick={() => setContentView("preview")}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                        contentView === "preview"
                          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                      }`}
                    >
                      Preview
                    </button>
                    {editing && (
                      <button
                        onClick={() => setContentView("html")}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                          contentView === "html"
                            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                            : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                        }`}
                      >
                        Edit HTML
                      </button>
                    )}
                  </div>

                  {contentView === "html" && editing ? (
                    <textarea
                      value={draft.content || ""}
                      onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                      rows={28}
                      className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs font-mono text-[var(--color-foreground)] resize-y leading-relaxed"
                    />
                  ) : (
                    <div
                      className="prose prose-sm max-w-none text-[var(--color-foreground)] bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-5 py-4 [&_h2]:text-[var(--color-foreground)] [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-[var(--color-foreground)] [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-[var(--color-foreground)] [&_p]:leading-relaxed [&_p]:mb-4 [&_a]:text-[var(--color-primary)] [&_a]:underline [&_li]:text-[var(--color-foreground)] [&_li]:leading-relaxed [&_ul]:mb-4 [&_ol]:mb-4 [&_strong]:font-semibold [&_em]:italic [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--color-primary)] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[var(--color-muted-foreground)]"
                      dangerouslySetInnerHTML={{ __html: editing ? (draft.content || "") : selectedPost.content }}
                    />
                  )}
                </div>
              </div>

              {/* Edit footer */}
              {editing && (
                <div className="flex justify-end gap-2 px-6 py-3 border-t border-[var(--color-border)]">
                  <button
                    onClick={() => { setEditing(false); setDraft({ title: selectedPost.title, h1: selectedPost.h1 || "", slug: selectedPost.slug || generateSlugPreview(selectedPost.title), content: selectedPost.content, metaDescription: selectedPost.metaDescription, featuredImageUrl: selectedPost.featuredImageUrl || "" }); }}
                    className="text-xs font-medium px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={saving}
                    className="text-xs font-medium px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-40"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function PostRow({ post, loading, onPreview, onPublish, onRewrite, onDelete }: {
  post: Post;
  loading: boolean;
  onPreview: () => void;
  onPublish: () => void;
  onRewrite: () => void;
  onDelete: () => void;
}) {
  const isGhostPublished = post.status === "published" && !post.publishedUrl;
  const canPublish = post.status === "ready" || post.status === "draft" || post.status === "failed" || isGhostPublished;
  const publishLabel = post.status === "failed" || isGhostPublished ? "Retry Publish" : "Publish";
  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-[var(--color-hover)] transition-colors">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{post.title}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-[var(--color-muted-foreground)]">{post.wordCount} words</span>
          {isGhostPublished && (
            <span className="text-xs text-[var(--color-warning)]">no live URL — likely never reached WP</span>
          )}
          {post.aiTellsDetected && post.aiTellsDetected.length > 0 && (
            <span className="text-xs text-[var(--color-warning)] cursor-help" title={`AI-tell phrases detected:\n${post.aiTellsDetected.join("\n")}`}>
              ⚠ {post.aiTellsDetected.length} AI tell{post.aiTellsDetected.length === 1 ? "" : "s"}
            </span>
          )}
          {post.publishedUrl && (
            <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-primary)] hover:underline">
              View live
            </a>
          )}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onPreview} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] transition-all">
          Preview
        </button>
        {canPublish && (
          <button onClick={onPublish} disabled={loading} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-success)] text-[var(--color-primary-foreground)] hover:opacity-90 transition-all disabled:opacity-40">
            {publishLabel}
          </button>
        )}
        {post.status !== "published" && (
          <button onClick={onRewrite} disabled={loading} className="text-xs font-medium px-3 py-1.5 rounded-lg text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 transition-all disabled:opacity-40">
            Rewrite
          </button>
        )}
        <button onClick={onDelete} className="text-xs font-medium px-2 py-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] transition-all" title={post.status === "published" ? "Delete from dashboard and optionally WordPress" : "Remove from dashboard"}>
          {post.status === "published" ? "Delete" : "Remove"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "destructive" }) {
  return (
    <div>
      <span className={`font-semibold ${tone === "destructive" ? "text-[var(--color-destructive)]" : "text-[var(--color-foreground)]"}`}>{value}</span>{" "}
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
    </div>
  );
}

function MetaRow({
  label, value, placeholder, editing, onChange, copyKey, copiedField, onCopy,
  counter, counterTone, multiline, mono, prefix,
}: {
  label: string;
  value: string;
  placeholder?: string;
  editing: boolean;
  onChange: (v: string) => void;
  copyKey: string;
  copiedField: string | null;
  onCopy: () => void;
  counter?: string;
  counterTone?: "ok" | "bad" | "muted";
  multiline?: boolean;
  mono?: boolean;
  prefix?: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">{label}</label>
        <div className="flex items-center gap-2">
          {counter && (
            <span className={`text-[10px] ${
              counterTone === "ok"  ? "text-[var(--color-success)]" :
              counterTone === "bad" ? "text-[var(--color-destructive)]" :
                                      "text-[var(--color-muted-foreground)]"
            }`}>{counter}</span>
          )}
          <button
            onClick={onCopy}
            className={`text-[10px] font-medium px-2 py-1 rounded transition-all ${
              copiedField === copyKey
                ? "bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
            }`}
          >
            {copiedField === copyKey ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      {editing ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-foreground)]"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-foreground)] ${mono ? "font-mono" : ""}`}
          />
        )
      ) : value ? (
        <p className={`text-sm text-[var(--color-foreground)] ${mono ? "font-mono" : ""}`}>{prefix}{value}</p>
      ) : (
        <p className="text-sm italic text-[var(--color-muted-foreground)]">
          {placeholder ? `(falls back to: ${placeholder})` : "(empty)"}
        </p>
      )}
    </div>
  );
}
