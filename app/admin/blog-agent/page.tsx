"use client";

import { useState, useEffect, useCallback } from "react";

interface Client {
  id: string;
  name: string;
  businessName: string;
  industry: string;
  location: string;
  tone: string;
  keywords: string[];
  postsPerMonth: number;
  isActive: boolean;
  wordpressUrl: string;
  wordpressUsername: string;
  wordpressAppPassword: string;
  targetAudience: string;
  blogCategories: string[];
  websiteUrl: string;
}

interface Topic {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string;
  targetKeywords: string[];
  estimatedSearchVolume: string;
  status: string;
  month: string;
}

interface Post {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  wordCount: number;
  status: string;
  publishedUrl?: string;
  content: string;
  excerpt: string;
  metaDescription: string;
}

type Tab = "dashboard" | "clients" | "topics" | "posts" | "schedule";

export default function BlogAgentDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [clients, setClients] = useState<Client[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 5000);
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

  const handleSeedClients = async () => {
    if (!confirm("This will load all 26 CS Design Studios clients. Continue?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/blog-agent/seed", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        showMessage(data.message);
        fetchClients();
      } else {
        showMessage(`Error: ${data.error}`);
      }
    } catch {
      showMessage("Failed to seed clients");
    }
    setLoading(false);
  };

  const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const client = {
      name: formData.get("name"),
      businessName: formData.get("businessName"),
      industry: formData.get("industry"),
      targetAudience: formData.get("targetAudience"),
      location: formData.get("location"),
      websiteUrl: formData.get("websiteUrl"),
      wordpressUrl: formData.get("wordpressUrl"),
      wordpressUsername: formData.get("wordpressUsername"),
      wordpressAppPassword: formData.get("wordpressAppPassword"),
      tone: formData.get("tone"),
      keywords: (formData.get("keywords") as string).split(",").map((k) => k.trim()).filter(Boolean),
      blogCategories: (formData.get("blogCategories") as string).split(",").map((c) => c.trim()).filter(Boolean),
      postsPerMonth: parseInt(formData.get("postsPerMonth") as string) || 2,
    };

    const res = await fetch("/api/blog-agent/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    });

    if (res.ok) {
      showMessage("Client added successfully!");
      setShowAddClient(false);
      form.reset();
      fetchClients();
    } else {
      showMessage("Failed to add client");
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm("Are you sure you want to delete this client?")) return;
    await fetch(`/api/blog-agent/clients?id=${id}`, { method: "DELETE" });
    fetchClients();
    showMessage("Client deleted");
  };

  const handleResearchTopics = async (clientId?: string) => {
    setLoading(true);
    showMessage("Researching topics... This may take a minute.");
    try {
      const res = await fetch("/api/blog-agent/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage(`Generated ${data.totalTopics} topic suggestions!`);
        fetchTopics();
      } else {
        showMessage(`Error: ${data.error}`);
      }
    } catch {
      showMessage("Failed to research topics");
    }
    setLoading(false);
  };

  const handleTopicAction = async (topicId: string, action: "approve" | "reject") => {
    const res = await fetch("/api/blog-agent/topics/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, action }),
    });
    if (res.ok) {
      showMessage(`Topic ${action}d!`);
      fetchTopics();
    }
  };

  const handleBulkApprove = async (topicIds: string[]) => {
    const res = await fetch("/api/blog-agent/topics/approve", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicIds, action: "approve" }),
    });
    if (res.ok) {
      showMessage(`${topicIds.length} topics approved!`);
      fetchTopics();
    }
  };

  const handleWritePosts = async (clientId?: string) => {
    setLoading(true);
    showMessage("Writing blog posts... This may take several minutes.");
    try {
      const res = await fetch("/api/blog-agent/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage(`Wrote ${data.postsWritten} blog post(s)!`);
        fetchPosts();
        fetchTopics();
      } else {
        showMessage(`Error: ${data.error}`);
      }
    } catch {
      showMessage("Failed to write posts");
    }
    setLoading(false);
  };

  const handlePublishPosts = async (clientId?: string) => {
    setLoading(true);
    showMessage("Publishing posts to WordPress...");
    try {
      const res = await fetch("/api/blog-agent/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage(
          `Published ${data.summary.success}/${data.summary.total} posts!`
        );
        fetchPosts();
      } else {
        showMessage(`Error: ${data.error}`);
      }
    } catch {
      showMessage("Failed to publish posts");
    }
    setLoading(false);
  };

  const handleTestConnection = async (clientId: string) => {
    const res = await fetch("/api/blog-agent/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json();
    showMessage(data.success ? "WordPress connected!" : `Failed: ${data.message}`);
  };

  const pendingTopics = topics.filter((t) => t.status === "pending");
  const approvedTopics = topics.filter((t) => t.status === "approved");
  const readyPosts = posts.filter((p) => p.status === "ready");
  const publishedPosts = posts.filter((p) => p.status === "published");

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Monthly Blogs Agent</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              CS Design Studios — Automated Blog Management
            </p>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-[var(--color-primary)]">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Agent working...</span>
            </div>
          )}
        </div>
      </header>

      {/* Message Toast */}
      {message && (
        <div className="fixed top-4 right-4 z-50 bg-[var(--color-primary)] text-white px-4 py-3 rounded-lg shadow-lg max-w-md">
          {message}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
          {[
            { key: "dashboard", label: "Dashboard" },
            { key: "clients", label: `Clients (${clients.length})` },
            { key: "topics", label: `Topics (${pendingTopics.length} pending)` },
            { key: "posts", label: `Posts (${readyPosts.length} ready)` },
            { key: "schedule", label: "Schedule" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as Tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-[var(--color-primary)] text-white"
                  : "border-transparent text-[var(--color-muted-foreground)] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Active Clients" value={clients.filter((c) => c.isActive).length} />
              <StatCard label="Pending Topics" value={pendingTopics.length} color="warning" />
              <StatCard label="Ready to Publish" value={readyPosts.length} color="primary" />
              <StatCard label="Published This Month" value={publishedPosts.length} color="success" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ActionCard
                title="1. Research Topics"
                description="AI researches trending topics for all active clients"
                buttonLabel="Run Research"
                onClick={() => handleResearchTopics()}
                disabled={loading || clients.length === 0}
              />
              <ActionCard
                title="2. Write Posts"
                description={`Write blog posts for ${approvedTopics.length} approved topics`}
                buttonLabel="Write Posts"
                onClick={() => handleWritePosts()}
                disabled={loading || approvedTopics.length === 0}
              />
              <ActionCard
                title="3. Publish"
                description={`Publish ${readyPosts.length} ready posts to WordPress`}
                buttonLabel="Publish All"
                onClick={() => handlePublishPosts()}
                disabled={loading || readyPosts.length === 0}
              />
            </div>

            {pendingTopics.length > 0 && (
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">Topics Awaiting Approval</h3>
                  <button
                    onClick={() => handleBulkApprove(pendingTopics.map((t) => t.id))}
                    className="text-sm bg-[var(--color-success)] text-white px-3 py-1.5 rounded hover:opacity-90"
                  >
                    Approve All ({pendingTopics.length})
                  </button>
                </div>
                <div className="space-y-2">
                  {pendingTopics.slice(0, 10).map((topic) => (
                    <div
                      key={topic.id}
                      className="flex items-center justify-between bg-[var(--color-muted)] rounded p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{topic.title}</p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {topic.clientName} — {topic.targetKeywords.join(", ")}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4 shrink-0">
                        <button
                          onClick={() => handleTopicAction(topic.id, "approve")}
                          className="text-xs bg-[var(--color-success)] text-white px-3 py-1 rounded hover:opacity-90"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleTopicAction(topic.id, "reject")}
                          className="text-xs bg-[var(--color-destructive)] text-white px-3 py-1 rounded hover:opacity-90"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                  {pendingTopics.length > 10 && (
                    <p className="text-sm text-[var(--color-muted-foreground)] text-center py-2">
                      +{pendingTopics.length - 10} more topics — switch to Topics tab to see all
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clients Tab */}
        {activeTab === "clients" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Client Management</h2>
              <div className="flex gap-2">
                {clients.length === 0 && (
                  <button
                    onClick={handleSeedClients}
                    disabled={loading}
                    className="bg-[var(--color-success)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    Load All 26 Clients
                  </button>
                )}
                <button
                  onClick={() => setShowAddClient(!showAddClient)}
                  className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90"
                >
                  {showAddClient ? "Cancel" : "+ Add Client"}
                </button>
              </div>
            </div>

            {showAddClient && (
              <form onSubmit={handleAddClient} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="name" label="Contact Name" placeholder="John Smith" required />
                  <FormField name="businessName" label="Business Name" placeholder="Acme Corp" required />
                  <FormField name="industry" label="Industry" placeholder="Plumbing, Real Estate, etc." required />
                  <FormField name="targetAudience" label="Target Audience" placeholder="Homeowners in Melbourne" />
                  <FormField name="location" label="Location" placeholder="Melbourne, VIC" />
                  <FormField name="websiteUrl" label="Website URL" placeholder="https://example.com" />
                  <FormField name="wordpressUrl" label="WordPress URL" placeholder="https://example.com" required />
                  <FormField name="wordpressUsername" label="WP Username" placeholder="admin" required />
                  <FormField name="wordpressAppPassword" label="WP App Password" placeholder="xxxx xxxx xxxx xxxx" required type="password" />
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-muted-foreground)] mb-1">Tone</label>
                    <select name="tone" className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-white">
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="friendly">Friendly</option>
                      <option value="authoritative">Authoritative</option>
                      <option value="conversational">Conversational</option>
                    </select>
                  </div>
                  <FormField name="keywords" label="Target Keywords" placeholder="plumber melbourne, emergency plumber" />
                  <FormField name="blogCategories" label="Blog Categories" placeholder="Tips, News, Guides" />
                  <FormField name="postsPerMonth" label="Posts Per Month" placeholder="2" type="number" />
                </div>
                <button
                  type="submit"
                  className="bg-[var(--color-primary)] text-white px-6 py-2 rounded-lg text-sm hover:opacity-90"
                >
                  Add Client
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-white">{client.businessName}</h3>
                      <p className="text-xs text-[var(--color-muted-foreground)]">{client.industry} — {client.location}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${client.isActive ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" : "bg-[var(--color-destructive)]/20 text-[var(--color-destructive)]"}`}>
                      {client.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-muted-foreground)] space-y-1 mb-3">
                    <p>Tone: {client.tone} | {client.postsPerMonth} posts/month</p>
                    <p className="truncate">Keywords: {client.keywords?.join(", ") || "None"}</p>
                    <p className="truncate">WP: {client.wordpressUrl}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTestConnection(client.id)}
                      className="text-xs bg-[var(--color-secondary)] text-white px-3 py-1.5 rounded hover:opacity-90"
                    >
                      Test WP
                    </button>
                    <button
                      onClick={() => handleResearchTopics(client.id)}
                      disabled={loading}
                      className="text-xs bg-[var(--color-primary)] text-white px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50"
                    >
                      Research
                    </button>
                    <button
                      onClick={() => handleDeleteClient(client.id)}
                      className="text-xs bg-[var(--color-destructive)] text-white px-3 py-1.5 rounded hover:opacity-90 ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {clients.length === 0 && (
                <p className="text-[var(--color-muted-foreground)] col-span-full text-center py-12">
                  No clients added yet. Click &quot;+ Add Client&quot; to get started.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Topics Tab */}
        {activeTab === "topics" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Topic Suggestions</h2>
              <div className="flex gap-2">
                {pendingTopics.length > 0 && (
                  <button
                    onClick={() => handleBulkApprove(pendingTopics.map((t) => t.id))}
                    className="bg-[var(--color-success)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90"
                  >
                    Approve All Pending ({pendingTopics.length})
                  </button>
                )}
                <button
                  onClick={() => handleResearchTopics()}
                  disabled={loading}
                  className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
                >
                  Research New Topics
                </button>
              </div>
            </div>

            {["pending", "approved", "rejected"].map((status) => {
              const filtered = topics.filter((t) => t.status === status);
              if (filtered.length === 0) return null;
              return (
                <div key={status}>
                  <h3 className="text-sm font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider mb-2">
                    {status} ({filtered.length})
                  </h3>
                  <div className="space-y-2">
                    {filtered.map((topic) => (
                      <div
                        key={topic.id}
                        className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white">{topic.title}</p>
                            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">{topic.description}</p>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <span className="text-xs bg-[var(--color-secondary)] px-2 py-0.5 rounded text-[var(--color-secondary-foreground)]">
                                {topic.clientName}
                              </span>
                              <span className="text-xs bg-[var(--color-secondary)] px-2 py-0.5 rounded text-[var(--color-secondary-foreground)]">
                                {topic.month}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                topic.estimatedSearchVolume === "high" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
                                topic.estimatedSearchVolume === "medium" ? "bg-[var(--color-warning)]/20 text-[var(--color-warning)]" :
                                "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                              }`}>
                                {topic.estimatedSearchVolume} volume
                              </span>
                              {topic.targetKeywords.map((kw) => (
                                <span key={kw} className="text-xs bg-[var(--color-muted)] px-2 py-0.5 rounded text-[var(--color-muted-foreground)]">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                          {status === "pending" && (
                            <div className="flex gap-2 ml-4 shrink-0">
                              <button
                                onClick={() => handleTopicAction(topic.id, "approve")}
                                className="text-sm bg-[var(--color-success)] text-white px-4 py-1.5 rounded hover:opacity-90"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleTopicAction(topic.id, "reject")}
                                className="text-sm bg-[var(--color-destructive)] text-white px-4 py-1.5 rounded hover:opacity-90"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {topics.length === 0 && (
              <p className="text-[var(--color-muted-foreground)] text-center py-12">
                No topics yet. Click &quot;Research New Topics&quot; to generate suggestions for your clients.
              </p>
            )}
          </div>
        )}

        {/* Posts Tab */}
        {activeTab === "posts" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Blog Posts</h2>
              <div className="flex gap-2">
                {approvedTopics.length > 0 && (
                  <button
                    onClick={() => handleWritePosts()}
                    disabled={loading}
                    className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    Write Posts ({approvedTopics.length} topics)
                  </button>
                )}
                {readyPosts.length > 0 && (
                  <button
                    onClick={() => handlePublishPosts()}
                    disabled={loading}
                    className="bg-[var(--color-success)] text-white px-4 py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    Publish All ({readyPosts.length})
                  </button>
                )}
              </div>
            </div>

            {/* Post Preview Modal */}
            {selectedPost && (
              <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelectedPost(null)}>
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold text-white">{selectedPost.title}</h2>
                    <button onClick={() => setSelectedPost(null)} className="text-[var(--color-muted-foreground)] hover:text-white text-xl">&times;</button>
                  </div>
                  <div className="text-sm text-[var(--color-muted-foreground)] mb-2">
                    <strong>Excerpt:</strong> {selectedPost.excerpt}
                  </div>
                  <div className="text-sm text-[var(--color-muted-foreground)] mb-4">
                    <strong>Meta:</strong> {selectedPost.metaDescription}
                  </div>
                  <div className="prose prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: selectedPost.content }} />
                </div>
              </div>
            )}

            {["ready", "draft", "published", "failed"].map((status) => {
              const filtered = posts.filter((p) => p.status === status);
              if (filtered.length === 0) return null;
              return (
                <div key={status}>
                  <h3 className="text-sm font-medium text-[var(--color-muted-foreground)] uppercase tracking-wider mb-2">
                    {status} ({filtered.length})
                  </h3>
                  <div className="space-y-2">
                    {filtered.map((post) => (
                      <div
                        key={post.id}
                        className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 flex items-center justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white">{post.title}</p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs text-[var(--color-muted-foreground)]">{post.clientName}</span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">{post.wordCount} words</span>
                            {post.publishedUrl && (
                              <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-primary)] hover:underline">
                                View Live
                              </a>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedPost(post)}
                          className="text-sm bg-[var(--color-secondary)] text-white px-3 py-1.5 rounded hover:opacity-90 ml-4"
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
              <p className="text-[var(--color-muted-foreground)] text-center py-12">
                No posts yet. Approve some topics first, then click &quot;Write Posts&quot;.
              </p>
            )}
          </div>
        )}

        {/* Schedule Tab */}
        {activeTab === "schedule" && <ScheduleTab />}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass =
    color === "primary" ? "text-[var(--color-primary)]" :
    color === "success" ? "text-[var(--color-success)]" :
    color === "warning" ? "text-[var(--color-warning)]" :
    "text-white";

  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}

function ActionCard({
  title, description, buttonLabel, onClick, disabled,
}: {
  title: string; description: string; buttonLabel: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-3">{description}</p>
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full bg-[var(--color-primary)] text-white px-4 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function FormField({
  name, label, placeholder, required, type = "text",
}: {
  name: string; label: string; placeholder: string; required?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-muted-foreground)] mb-1">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-white placeholder-[var(--color-muted-foreground)]"
      />
    </div>
  );
}

function ScheduleTab() {
  const [schedule, setSchedule] = useState({
    enabled: false,
    researchDayOfMonth: 1,
    writeDayOfMonth: 10,
    publishDayOfMonth: 15,
    timezone: "Australia/Melbourne",
  });
  const [runs, setRuns] = useState<Array<{ id: string; type: string; status: string; message: string; startedAt: string }>>([]);

  useEffect(() => {
    fetch("/api/blog-agent/schedule")
      .then((r) => r.json())
      .then((data) => {
        if (data.schedule) setSchedule(data.schedule);
        if (data.recentRuns) setRuns(data.recentRuns);
      });
  }, []);

  const handleSave = async () => {
    await fetch("/api/blog-agent/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule),
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
        <h3 className="font-semibold text-white mb-4">Automation Schedule</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-white">Enable automatic monthly schedule</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-muted-foreground)] mb-1">Research Day</label>
              <input
                type="number"
                min="1"
                max="28"
                value={schedule.researchDayOfMonth}
                onChange={(e) => setSchedule({ ...schedule, researchDayOfMonth: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-white"
              />
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Day topics are generated</p>
            </div>
            <div>
              <label className="block text-sm text-[var(--color-muted-foreground)] mb-1">Write Day</label>
              <input
                type="number"
                min="1"
                max="28"
                value={schedule.writeDayOfMonth}
                onChange={(e) => setSchedule({ ...schedule, writeDayOfMonth: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-white"
              />
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Day approved topics are written</p>
            </div>
            <div>
              <label className="block text-sm text-[var(--color-muted-foreground)] mb-1">Publish Day</label>
              <input
                type="number"
                min="1"
                max="28"
                value={schedule.publishDayOfMonth}
                onChange={(e) => setSchedule({ ...schedule, publishDayOfMonth: parseInt(e.target.value) })}
                className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-white"
              />
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Day posts are published to WordPress</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            className="bg-[var(--color-primary)] text-white px-6 py-2 rounded text-sm hover:opacity-90"
          >
            Save Schedule
          </button>
        </div>
      </div>

      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
        <h3 className="font-semibold text-white mb-4">Recent Agent Runs</h3>
        {runs.length > 0 ? (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between bg-[var(--color-muted)] rounded p-3">
                <div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded mr-2 ${
                    run.status === "completed" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
                    run.status === "failed" ? "bg-[var(--color-destructive)]/20 text-[var(--color-destructive)]" :
                    "bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
                  }`}>
                    {run.type}
                  </span>
                  <span className="text-sm text-white">{run.message}</span>
                </div>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--color-muted-foreground)] text-sm">No runs yet.</p>
        )}
      </div>

      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
        <h3 className="font-semibold text-white mb-2">Monthly Workflow</h3>
        <div className="text-sm text-[var(--color-muted-foreground)] space-y-2">
          <p><strong className="text-white">Day {schedule.researchDayOfMonth}:</strong> Agent researches trending topics for all active clients and generates suggestions</p>
          <p><strong className="text-white">Day {schedule.researchDayOfMonth}-{schedule.writeDayOfMonth}:</strong> You review and approve/reject topic suggestions in the dashboard</p>
          <p><strong className="text-white">Day {schedule.writeDayOfMonth}:</strong> Agent writes full SEO-optimized blog posts for all approved topics</p>
          <p><strong className="text-white">Day {schedule.writeDayOfMonth}-{schedule.publishDayOfMonth}:</strong> You review written posts and make any edits</p>
          <p><strong className="text-white">Day {schedule.publishDayOfMonth}:</strong> Agent publishes all ready posts to client WordPress sites</p>
        </div>
      </div>
    </div>
  );
}
