"use client";

import { useState, useEffect, useCallback } from "react";
import type { Client, Topic, Post, Tab } from "./components/types";
import Sidebar from "./components/sidebar";
import DashboardTab from "./components/dashboard-tab";
import ClientsTab from "./components/clients-tab";
import TopicsTab from "./components/topics-tab";
import PostsTab from "./components/posts-tab";
import SettingsTab from "./components/settings-tab";
import ScheduleTab from "./components/schedule-tab";

export default function BlogAgentDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [clients, setClients] = useState<Client[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchClients = useCallback(async () => {
    const res = await fetch("/api/blog-agent/clients");
    const data = await res.json();
    setClients(data.clients || []);
  }, []);

  const fetchTopics = useCallback(async () => {
    const res = await fetch("/api/blog-agent/topics");
    const data = await res.json();
    setTopics(data.topics || []);
  }, []);

  const fetchPosts = useCallback(async () => {
    const res = await fetch("/api/blog-agent/posts");
    const data = await res.json();
    setPosts(data.posts || []);
  }, []);

  useEffect(() => {
    fetchClients();
    fetchTopics();
    fetchPosts();
  }, [fetchClients, fetchTopics, fetchPosts]);

  // --- Handlers ---

  const handleSeedClients = async () => {
    if (!confirm("This will load all 26 CS Design Studios clients. Continue?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/blog-agent/seed", { method: "POST" });
      const data = await res.json();
      res.ok ? showToast(data.message, "success") : showToast(`Error: ${data.error}`, "error");
      fetchClients();
    } catch { showToast("Failed to seed clients", "error"); }
    setLoading(false);
  };

  const handleApplyPostsRule = async () => {
    if (!confirm("Set all clients to 1 post/month except GLW and Rose (2/month). Continue?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/blog-agent/clients/apply-posts-rule", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          data.updatedCount > 0
            ? `Updated ${data.updatedCount} client${data.updatedCount === 1 ? "" : "s"}`
            : "All clients already match the rule",
          "success"
        );
        fetchClients();
      } else {
        showToast(`Error: ${data.error}`, "error");
      }
    } catch { showToast("Failed to sync rule", "error"); }
    setLoading(false);
  };

  const handleAddClient = async (clientData: Record<string, unknown>) => {
    const res = await fetch("/api/blog-agent/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientData),
    });
    if (res.ok) {
      showToast("Client added!", "success");
      fetchClients();
    } else {
      showToast("Failed to add client", "error");
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm("Delete this client?")) return;
    await fetch(`/api/blog-agent/clients?id=${id}`, { method: "DELETE" });
    fetchClients();
    showToast("Client deleted", "info");
  };

  const handleUpdateClient = async (client: Client) => {
    await fetch("/api/blog-agent/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    });
    fetchClients();
    showToast(`${client.businessName} updated`, "success");
  };

  const handleToggleActive = async (client: Client) => {
    const updated = { ...client, isActive: !client.isActive, updatedAt: new Date().toISOString() };
    await fetch("/api/blog-agent/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    fetchClients();
    showToast(`${client.businessName} ${updated.isActive ? "activated" : "deactivated"}`, "info");
  };

  const handleTestConnection = async (clientId: string) => {
    const res = await fetch("/api/blog-agent/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json();
    showToast(data.success ? "WordPress connected!" : `Failed: ${data.message}`, data.success ? "success" : "error");
  };

  const handleResearchTopics = async (clientId?: string, regenerate = false) => {
    setLoading(true);
    showToast(regenerate ? "Regenerating topics..." : "Researching topics...", "info");
    try {
      const res = await fetch("/api/blog-agent/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, regenerate }),
      });
      const data = await res.json();
      res.ok ? showToast(`Generated ${data.totalTopics} topics!`, "success") : showToast(`Error: ${data.error}`, "error");
      fetchTopics();
    } catch { showToast("Failed to research topics", "error"); }
    setLoading(false);
  };

  const handleTopicAction = async (topicId: string, action: "approve" | "reject") => {
    const res = await fetch("/api/blog-agent/topics/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, action }),
    });
    if (res.ok) {
      showToast(action === "approve" ? "Topic approved!" : "Topic removed", action === "approve" ? "success" : "info");
      fetchTopics();
    }
  };

  const handleBulkApprove = async (topicIds: string[]) => {
    const res = await fetch("/api/blog-agent/topics/approve", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicIds, action: "approve" }),
    });
    if (res.ok) { showToast(`${topicIds.length} topics approved!`, "success"); fetchTopics(); }
  };

  const handleWritePosts = async (clientId?: string, topicIds?: string[]) => {
    setLoading(true);
    showToast(
      topicIds?.length
        ? `Writing ${topicIds.length} selected post(s)...`
        : "Writing blog posts...",
      "info"
    );
    try {
      const res = await fetch("/api/blog-agent/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, topicIds }),
      });
      const data = await res.json();
      res.ok ? showToast(`Wrote ${data.postsWritten} post(s)!`, "success") : showToast(`Error: ${data.error}`, "error");
      fetchPosts();
      fetchTopics();
    } catch { showToast("Failed to write posts", "error"); }
    setLoading(false);
  };

  const handleRewritePost = async (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (!confirm(`Rewrite "${post.title}"? The current version will be replaced.`)) return;
    setLoading(true);
    showToast("Rewriting post...", "info");
    try {
      // Delete old version
      await fetch(`/api/blog-agent/posts?id=${postId}`, { method: "DELETE" });
      // Write a fresh version from the same topic
      const res = await fetch("/api/blog-agent/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: [post.topicId] }),
      });
      const data = await res.json();
      res.ok ? showToast(`Rewritten! ${data.postsWritten} post(s)`, "success") : showToast(`Error: ${data.error}`, "error");
      fetchPosts();
    } catch { showToast("Failed to rewrite post", "error"); }
    setLoading(false);
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm("Remove this post?")) return;
    const res = await fetch(`/api/blog-agent/posts?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Post removed", "info");
      fetchPosts();
    } else {
      showToast("Failed to remove post", "error");
    }
  };

  const handlePublishPosts = async (clientId?: string) => {
    setLoading(true);
    showToast("Publishing to WordPress...", "info");
    try {
      const res = await fetch("/api/blog-agent/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      res.ok ? showToast(`Published ${data.summary.success}/${data.summary.total} posts!`, "success") : showToast(`Error: ${data.error}`, "error");
      fetchPosts();
    } catch { showToast("Failed to publish posts", "error"); }
    setLoading(false);
  };

  const pendingTopics = topics.filter((t) => t.status === "pending");
  const readyPosts = posts.filter((p) => p.status === "ready");

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={{ clients: clients.length, pendingTopics: pendingTopics.length, readyPosts: readyPosts.length }}
        loading={loading}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-[var(--color-sidebar)] border-b border-[var(--color-sidebar-border)] px-4 py-3 flex items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} className="p-1 -ml-1 text-[var(--color-foreground)]">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <img src="https://www.csdesignstudios.com/wp-content/uploads/CSLOGONAV.webp" alt="CS Design Studios" className="w-6 h-6 object-contain block dark:hidden" />
        <img src="https://www.csdesignstudios.com/wp-content/uploads/yootheme/cache/8d/cs-design-studios-logo-8d06a929.webp" alt="CS Design Studios" className="w-6 h-6 object-contain hidden dark:block" />
        <span className="text-sm font-semibold text-[var(--color-foreground)]">Monthly Blogs</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-toast-in ${
          toast.type === "success" ? "bg-[var(--color-success)] text-[var(--color-primary-foreground)]" :
          toast.type === "error" ? "bg-[var(--color-destructive)] text-[var(--color-primary-foreground)]" :
          "bg-[var(--color-card)] text-[var(--color-foreground)] border border-[var(--color-border)]"
        }`}>
          {toast.type === "success" && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          )}
          {toast.type === "error" && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          )}
          {toast.msg}
        </div>
      )}

      {/* Main content */}
      <main className="pt-14 md:pt-0 md:pl-60 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[var(--color-foreground)]">
              {activeTab === "dashboard" ? "Dashboard" :
               activeTab === "clients" ? "Clients" :
               activeTab === "topics" ? "Topics" :
               activeTab === "posts" ? "Posts" :
               activeTab === "settings" ? "Content Rules" : "Schedule"}
            </h2>
          </div>

          {activeTab === "dashboard" && (
            <DashboardTab
              clients={clients}
              topics={topics}
              posts={posts}
              loading={loading}
              onResearch={() => handleResearchTopics()}
              onWritePosts={() => handleWritePosts()}
              onPublishPosts={() => handlePublishPosts()}
              onApprove={(id) => handleTopicAction(id, "approve")}
              onBulkApprove={handleBulkApprove}
              onReject={(id) => handleTopicAction(id, "reject")}
            />
          )}

          {activeTab === "clients" && (
            <ClientsTab
              clients={clients}
              loading={loading}
              onSeed={handleSeedClients}
              onAddClient={handleAddClient}
              onDeleteClient={handleDeleteClient}
              onToggleActive={handleToggleActive}
              onUpdateClient={handleUpdateClient}
              onTestConnection={handleTestConnection}
              onResearch={(id) => handleResearchTopics(id)}
              onApplyPostsRule={handleApplyPostsRule}
            />
          )}

          {activeTab === "topics" && (
            <TopicsTab
              clients={clients}
              topics={topics}
              loading={loading}
              onApprove={(id) => handleTopicAction(id, "approve")}
              onReject={(id) => handleTopicAction(id, "reject")}
              onBulkApprove={handleBulkApprove}
              onRegenerate={(clientId) => handleResearchTopics(clientId, true)}
              onWriteSelected={(topicIds) => handleWritePosts(undefined, topicIds)}
            />
          )}

          {activeTab === "posts" && (
            <PostsTab
              clients={clients}
              topics={topics}
              posts={posts}
              loading={loading}
              onWritePosts={() => handleWritePosts()}
              onPublishPosts={() => handlePublishPosts()}
              onPostUpdated={fetchPosts}
              onDeletePost={handleDeletePost}
              onRewritePost={handleRewritePost}
            />
          )}

          {activeTab === "settings" && <SettingsTab />}
          {activeTab === "schedule" && <ScheduleTab />}
        </div>
      </main>
    </div>
  );
}
