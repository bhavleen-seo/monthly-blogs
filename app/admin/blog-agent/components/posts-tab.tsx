"use client";

import { useState } from "react";
import type { Client, Topic, Post } from "./types";

export default function PostsTab({
  clients,
  topics,
  posts,
  loading,
  onWritePosts,
  onPublishPosts,
}: {
  clients: Client[];
  topics: Topic[];
  posts: Post[];
  loading: boolean;
  onWritePosts: () => void;
  onPublishPosts: () => void;
}) {
  const [clientFilter, setClientFilter] = useState("");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [copied, setCopied] = useState(false);

  const approvedTopics = topics.filter((t) => t.status === "approved");
  const filtered = clientFilter ? posts.filter((p) => p.clientId === clientFilter) : posts;
  const readyPosts = filtered.filter((p) => p.status === "ready");

  const copyContent = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            <button onClick={onWritePosts} disabled={loading} className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
              Write Posts ({approvedTopics.length} topics)
            </button>
          )}
          {readyPosts.length > 0 && (
            <button onClick={onPublishPosts} disabled={loading} className="bg-[var(--color-success)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
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
                    <div className="flex items-center gap-3 mt-1">
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
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="min-w-0 mr-4">
                <h2 className="text-lg font-bold text-[var(--color-foreground)]">{selectedPost.title}</h2>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{selectedPost.clientName} &middot; {selectedPost.wordCount} words</p>
              </div>
              <div className="flex gap-2 shrink-0">
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
                <button onClick={() => setSelectedPost(null)} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors text-xl leading-none">&times;</button>
              </div>
            </div>
            {/* Modal body */}
            <div className="overflow-y-auto px-6 py-5 space-y-4">
              <div className="bg-[var(--color-muted)] rounded-lg px-4 py-3 space-y-2">
                <p className="text-xs"><span className="font-medium text-[var(--color-foreground)]">Excerpt:</span> <span className="text-[var(--color-muted-foreground)]">{selectedPost.excerpt}</span></p>
                <p className="text-xs"><span className="font-medium text-[var(--color-foreground)]">Meta:</span> <span className="text-[var(--color-muted-foreground)]">{selectedPost.metaDescription}</span></p>
              </div>
              <div className="prose prose-sm max-w-none text-[var(--color-foreground)] [&_h2]:text-[var(--color-foreground)] [&_h3]:text-[var(--color-foreground)] [&_a]:text-[var(--color-primary)] [&_p]:text-[var(--color-foreground)] [&_li]:text-[var(--color-foreground)]" dangerouslySetInnerHTML={{ __html: selectedPost.content }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
