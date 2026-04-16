"use client";

import { useState, useEffect } from "react";
import type { Client, Topic, Post } from "./types";

export default function PostsTab({
  clients,
  topics,
  posts,
  loading,
  onWritePosts,
  onPublishPosts,
  onPostUpdated,
}: {
  clients: Client[];
  topics: Topic[];
  posts: Post[];
  loading: boolean;
  onWritePosts: () => void;
  onPublishPosts: () => void;
  onPostUpdated: () => void;
}) {
  const [clientFilter, setClientFilter] = useState("");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [copied, setCopied] = useState(false);
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
        content: selectedPost.content,
        excerpt: selectedPost.excerpt,
        metaDescription: selectedPost.metaDescription,
        featuredImageUrl: selectedPost.featuredImageUrl || "",
      });
      setEditing(false);
      setContentView("preview");
    }
  }, [selectedPost]);

  const copyContent = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              {items.map((post) => (
                <div key={post.id} className="flex items-center justify-between px-5 py-4 hover:bg-[var(--color-hover)] transition-colors">
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
                  <button
                    onClick={() => { setSelectedPost(post); setCopied(false); }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] transition-all"
                  >
                    Preview
                  </button>
                </div>
              ))}
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
      {selectedPost && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedPost(null)}>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="min-w-0 mr-4 flex-1">
                {editing ? (
                  <input
                    type="text"
                    value={draft.title || ""}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full text-lg font-bold text-[var(--color-foreground)] bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none pb-1"
                  />
                ) : (
                  <h2 className="text-lg font-bold text-[var(--color-foreground)]">{selectedPost.title}</h2>
                )}
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{selectedPost.clientName} &middot; {selectedPost.wordCount} words</p>
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
                    onClick={() => copyContent(selectedPost.content)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                      copied
                        ? "border-[var(--color-success)] text-[var(--color-success)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy HTML"}
                  </button>
                )}
                <button onClick={() => setSelectedPost(null)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors text-xl leading-none">&times;</button>
              </div>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
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

              {/* Excerpt + meta */}
              <div className="bg-[var(--color-muted)] rounded-lg px-4 py-3 space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Excerpt</label>
                  {editing ? (
                    <textarea
                      value={draft.excerpt || ""}
                      onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
                      rows={2}
                      className="w-full mt-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-foreground)]"
                    />
                  ) : (
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{selectedPost.excerpt}</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">Meta description</label>
                  {editing ? (
                    <textarea
                      value={draft.metaDescription || ""}
                      onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
                      rows={2}
                      className="w-full mt-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-foreground)]"
                    />
                  ) : (
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{selectedPost.metaDescription}</p>
                  )}
                </div>
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
                  onClick={() => { setEditing(false); setDraft({ title: selectedPost.title, content: selectedPost.content, excerpt: selectedPost.excerpt, metaDescription: selectedPost.metaDescription, featuredImageUrl: selectedPost.featuredImageUrl || "" }); }}
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
      )}
    </div>
  );
}
