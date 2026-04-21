"use client";

import { useState, useEffect } from "react";
import type { Client, Topic, Post } from "./types";

function generateSlugPreview(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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
}: {
  clients: Client[];
  topics: Topic[];
  posts: Post[];
  loading: boolean;
  onWritePosts: () => void;
  onPublishPosts: () => void;
  onPublishPost: (postId: string) => void;
  onPostUpdated: () => void;
  onDeletePost: (id: string) => void;
  onRewritePost: (postId: string) => void;
}) {
  const [clientFilter, setClientFilter] = useState("");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Post>>({});
  const [saving, setSaving] = useState(false);
  const [contentView, setContentView] = useState<"preview" | "html">("preview");

  const approvedTopics = topics.filter((t) => t.status === "approved");
  const filtered = clientFilter ? posts.filter((p) => p.clientId === clientFilter) : posts;
  const readyPosts = filtered.filter((p) => p.status === "ready");

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

  const sections: { status: string; label: string }[] = [
    { status: "ready", label: "Ready to Publish" },
    { status: "draft", label: "Drafts" },
    { status: "published", label: "Published" },
    { status: "failed", label: "Failed" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
        <div className="flex gap-2">
          {approvedTopics.length > 0 && (
            <button onClick={onWritePosts} disabled={loading} className="bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
              Write Posts ({approvedTopics.length} topics)
            </button>
          )}
          {readyPosts.length > 0 && (
            <button onClick={onPublishPosts} disabled={loading} className="bg-[var(--color-success)] text-[var(--color-primary-foreground)] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
              Publish ({readyPosts.length})
            </button>
          )}
        </div>
      </div>

      {/* Post sections */}
      {sections.map(({ status, label }) => {
        const items = filtered.filter((p) => p.status === status);
        if (items.length === 0) return null;
        return (
          <div key={status} className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">{label} ({items.length})</h3>
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border)]">
              {items.map((post) => {
                const isGhostPublished = post.status === "published" && !post.publishedUrl;
                const canPublish =
                  post.status === "ready" ||
                  post.status === "draft" ||
                  post.status === "failed" ||
                  isGhostPublished;
                const publishLabel =
                  post.status === "failed" || isGhostPublished ? "Retry Publish" : "Publish";
                return (
                <div key={post.id} className="group flex items-center justify-between px-5 py-4 hover:bg-[var(--color-hover)] transition-colors">
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{post.title}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-[var(--color-muted-foreground)]">{post.clientName}</span>
                      <span className="text-xs text-[var(--color-muted-foreground)]">{post.wordCount} words</span>
                      <span className={`inline-flex items-center gap-1 text-xs ${
                        status === "published" ? "text-[var(--color-success)]" :
                        status === "ready" ? "text-[var(--color-primary)]" :
                        status === "failed" ? "text-[var(--color-destructive)]" :
                        "text-[var(--color-muted-foreground)]"
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {status}
                      </span>
                      {isGhostPublished && (
                        <span className="text-xs text-[var(--color-warning)]">no live URL — likely never reached WP</span>
                      )}
                      {post.featuredImageUrl && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          image
                        </span>
                      )}
                      {post.publishedUrl && (
                        <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-primary)] hover:underline">
                          View Live
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setSelectedPost(post); setCopiedField(null); }}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] transition-all"
                    >
                      Preview
                    </button>
                    {canPublish && (
                      <button
                        onClick={() => onPublishPost(post.id)}
                        disabled={loading}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-success)] text-[var(--color-primary-foreground)] hover:opacity-90 transition-all disabled:opacity-40"
                      >
                        {publishLabel}
                      </button>
                    )}
                    {post.status !== "published" && (
                      <>
                        <button
                          onClick={() => onRewritePost(post.id)}
                          disabled={loading}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-40"
                        >
                          Rewrite
                        </button>
                        <button
                          onClick={() => onDeletePost(post.id)}
                          className="text-xs font-medium px-2 py-1.5 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] transition-all opacity-0 group-hover:opacity-100"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {posts.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[var(--color-muted-foreground)] text-sm">No posts yet. Approve topics first, then write posts.</p>
        </div>
      )}

      {/* Preview modal */}
      {selectedPost && (() => {
        const displaySlug = (editing ? draft.slug : selectedPost.slug) || generateSlugPreview(selectedPost.title);
        const displayH1 = (editing ? draft.h1 : selectedPost.h1) || "";
        const displayTitle = editing ? (draft.title || "") : selectedPost.title;
        const displayMeta = editing ? (draft.metaDescription || "") : selectedPost.metaDescription;
        const h1SameAsTitle = displayH1.trim().length > 0 && displayH1.trim().toLowerCase() === displayTitle.trim().toLowerCase();
        const titleLen = displayTitle.length;
        const metaLen = displayMeta.length;
        const h1Len = displayH1.length;

        return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedPost(null)}>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Modal header — compact post meta only */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">{selectedPost.clientName}</p>
                <span className="text-[10px] text-[var(--color-muted-foreground)]">&middot;</span>
                <span className="text-[10px] text-[var(--color-muted-foreground)]">{selectedPost.wordCount} words</span>
                <span className={`text-[10px] inline-flex items-center gap-1 ${
                  selectedPost.status === "published" ? "text-[var(--color-success)]" :
                  selectedPost.status === "ready" ? "text-[var(--color-primary)]" :
                  selectedPost.status === "failed" ? "text-[var(--color-destructive)]" :
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
                <button onClick={() => setSelectedPost(null)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors text-xl leading-none">&times;</button>
              </div>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
              {/* H1 Heading — what readers see on the page */}
              <div className="bg-[var(--color-background)] border-2 border-[var(--color-primary)]/40 rounded-lg px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-wider">H1 Heading</span>
                    <span className="text-[10px] text-[var(--color-muted-foreground)]">visible to readers at top of post</span>
                  </div>
                  <button
                    onClick={() => copyField("h1", displayH1 || displayTitle)}
                    className={`text-[10px] font-medium px-2 py-1 rounded transition-all ${
                      copiedField === "h1"
                        ? "bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                        : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                    }`}
                  >
                    {copiedField === "h1" ? "Copied!" : "Copy"}
                  </button>
                </div>
                {editing ? (
                  <input
                    type="text"
                    value={draft.h1 || ""}
                    onChange={(e) => setDraft({ ...draft, h1: e.target.value })}
                    placeholder="e.g. How Much Do You Need to Earn to Afford a $200,000 Home?"
                    className="w-full text-base font-bold text-[var(--color-foreground)] bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none pb-1"
                  />
                ) : (
                  <h2 className="text-base font-bold text-[var(--color-foreground)]">{displayH1 || <span className="italic font-normal text-[var(--color-muted-foreground)]">(falls back to page title — edit to set a distinct H1)</span>}</h2>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">{h1Len} chars</span>
                  {h1SameAsTitle && (
                    <span className="text-[10px] text-[var(--color-destructive)] font-medium">&#9888; H1 matches page title — should be different for SEO</span>
                  )}
                </div>
              </div>

              {/* SEO Metadata — copy-friendly */}
              <div className="bg-[var(--color-muted)] rounded-lg px-4 py-3 space-y-4">
                <p className="text-[10px] font-bold text-[var(--color-muted-foreground)] uppercase tracking-wider">SEO Metadata</p>

                {/* Page Title */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Page Title <span className="normal-case font-normal">(&lt;title&gt; tag / SERP)</span></label>
                    <button
                      onClick={() => copyField("title", displayTitle)}
                      className={`text-[10px] font-medium px-2 py-1 rounded transition-all ${
                        copiedField === "title"
                          ? "bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                      }`}
                    >
                      {copiedField === "title" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  {editing ? (
                    <input
                      type="text"
                      value={draft.title || ""}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-foreground)]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{displayTitle}</p>
                  )}
                  <span className={`text-[10px] ${titleLen <= 60 ? "text-[var(--color-success)]" : "text-[var(--color-destructive)]"}`}>{titleLen}/60 chars</span>
                </div>

                {/* URL Slug */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">URL Slug</label>
                    <button
                      onClick={() => copyField("slug", displaySlug)}
                      className={`text-[10px] font-medium px-2 py-1 rounded transition-all ${
                        copiedField === "slug"
                          ? "bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                      }`}
                    >
                      {copiedField === "slug" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  {editing ? (
                    <input
                      type="text"
                      value={draft.slug || ""}
                      onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") })}
                      className="w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded px-2 py-1.5 text-sm font-mono text-[var(--color-foreground)]"
                    />
                  ) : (
                    <p className="text-sm font-mono text-[var(--color-foreground)]">/{displaySlug}</p>
                  )}
                </div>

                {/* Meta Description */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Meta Description</label>
                    <button
                      onClick={() => copyField("meta", displayMeta)}
                      className={`text-[10px] font-medium px-2 py-1 rounded transition-all ${
                        copiedField === "meta"
                          ? "bg-[var(--color-success)] text-[var(--color-primary-foreground)]"
                          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                      }`}
                    >
                      {copiedField === "meta" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  {editing ? (
                    <textarea
                      value={draft.metaDescription || ""}
                      onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
                      rows={2}
                      className="w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-foreground)]"
                    />
                  ) : (
                    <p className="text-xs text-[var(--color-foreground)]">{displayMeta}</p>
                  )}
                  <span className={`text-[10px] ${metaLen >= 140 && metaLen <= 160 ? "text-[var(--color-success)]" : "text-[var(--color-muted-foreground)]"}`}>{metaLen}/160 chars</span>
                </div>
              </div>

              {/* Featured image */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Featured Image URL</label>
                {selectedPost.featuredImagePrompt && (
                  <p className="text-[10px] text-[var(--color-muted-foreground)] italic">
                    AI suggested prompt: &ldquo;{selectedPost.featuredImagePrompt}&rdquo; — paste a Freepik URL below
                  </p>
                )}
                {editing || !selectedPost.featuredImageUrl ? (
                  <input
                    type="url"
                    value={draft.featuredImageUrl || ""}
                    onChange={(e) => setDraft({ ...draft, featuredImageUrl: e.target.value })}
                    placeholder="https://img.freepik.com/..."
                    disabled={!editing}
                    className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)] disabled:opacity-50"
                  />
                ) : null}
                {(editing ? draft.featuredImageUrl : selectedPost.featuredImageUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={editing ? draft.featuredImageUrl : selectedPost.featuredImageUrl}
                    alt="Featured"
                    className="w-full max-h-64 object-cover rounded-lg border border-[var(--color-border)]"
                  />
                )}
              </div>

              {/* Content — tabbed Preview / HTML */}
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
                    rows={25}
                    className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-xs font-mono text-[var(--color-foreground)] resize-y leading-relaxed"
                  />
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-[var(--color-foreground)] bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-6 py-5 [&_h2]:text-[var(--color-foreground)] [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-[var(--color-foreground)] [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-[var(--color-foreground)] [&_p]:leading-relaxed [&_p]:mb-4 [&_a]:text-[var(--color-primary)] [&_a]:underline [&_li]:text-[var(--color-foreground)] [&_li]:leading-relaxed [&_ul]:mb-4 [&_ol]:mb-4 [&_strong]:font-semibold [&_em]:italic [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--color-primary)] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[var(--color-muted-foreground)]"
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
