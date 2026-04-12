"use client";

import { useState } from "react";
import type { Client } from "./types";

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
}) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState<string | null>(null);
  const [kwDraft, setKwDraft] = useState("");
  const [seoDraft, setSeoDraft] = useState("");

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
      tone: fd.get("tone"),
      keywords: (fd.get("keywords") as string).split(",").map((k) => k.trim()).filter(Boolean),
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
        <div className="flex gap-2">
          {clients.length === 0 && (
            <button onClick={onSeed} disabled={loading} className="bg-[var(--color-success)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
              Load All 26 Clients
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
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
            <Input name="wordpressUsername" label="WP Username" placeholder="admin" required />
            <Input name="wordpressAppPassword" label="WP App Password" placeholder="xxxx xxxx xxxx" required type="password" />
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
            <Input name="keywords" label="Target Keywords" placeholder="plumber arizona, emergency plumber" />
            <Input name="blogCategories" label="Blog Categories" placeholder="Tips, News, Guides" />
            <Input name="postsPerMonth" label="Posts Per Month" placeholder="1" type="number" />
          </div>
          <button type="submit" className="mt-4 bg-[var(--color-primary)] text-white px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Add Client
          </button>
        </form>
      )}

      {/* Client grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((client) => (
          <div key={client.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5 transition-all duration-200 hover:border-[var(--color-primary)]/30 group">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--color-foreground)] truncate">{client.businessName}</h3>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{client.industry} &middot; {client.location}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                <input
                  type="checkbox"
                  checked={client.isActive}
                  onChange={() => onToggleActive(client)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[var(--color-muted)] peer-checked:bg-[var(--color-success)] rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)] space-y-1 mb-4">
              <p className="capitalize">Tone: {client.tone} &middot; {client.postsPerMonth} post/mo</p>
              <p className="truncate">Keywords: {client.keywords?.join(", ") || "None"}</p>
              <p className="truncate">WP: {client.wordpressUrl}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (editingKeywords === client.id) {
                    setEditingKeywords(null);
                  } else {
                    setEditingKeywords(client.id);
                    setKwDraft(client.keywords?.join(", ") || "");
                    setSeoDraft(client.seoNotes || "");
                  }
                }}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                  editingKeywords === client.id
                    ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/5"
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]"
                }`}
              >
                Keywords
              </button>
              <button onClick={() => onTestConnection(client.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)] transition-all">
                Test WP
              </button>
              <button onClick={() => onResearch(client.id)} disabled={loading} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-40 transition-all">
                Research
              </button>
              <button onClick={() => onDeleteClient(client.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 transition-all ml-auto opacity-0 group-hover:opacity-100">
                Delete
              </button>
            </div>

            {/* Keywords & SEO editor */}
            {editingKeywords === client.id && (
              <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-3 animate-slide-up">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Target Keywords</label>
                  <input
                    type="text"
                    value={kwDraft}
                    onChange={(e) => setKwDraft(e.target.value)}
                    placeholder="keyword 1, keyword 2, keyword 3"
                    className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)]"
                  />
                  <p className="text-[10px] text-[var(--color-muted-foreground)] mt-1">Comma-separated keywords Claude should target</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">SEO Notes for this Client</label>
                  <textarea
                    value={seoDraft}
                    onChange={(e) => setSeoDraft(e.target.value)}
                    rows={3}
                    placeholder="e.g. Focus on local Phoenix area keywords. Link to /services/roof-repair page. Mention 20+ years experience."
                    className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)] resize-y"
                  />
                  <p className="text-[10px] text-[var(--color-muted-foreground)] mt-1">Client-specific instructions Claude follows when researching and writing</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const updated = {
                        ...client,
                        keywords: kwDraft.split(",").map((k) => k.trim()).filter(Boolean),
                        seoNotes: seoDraft,
                        updatedAt: new Date().toISOString(),
                      };
                      onUpdateClient(updated);
                      setEditingKeywords(null);
                    }}
                    className="text-xs font-medium px-4 py-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-all"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingKeywords(null)}
                    className="text-xs font-medium px-4 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
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

function Input({ name, label, placeholder, required, type = "text" }: { name: string; label: string; placeholder: string; required?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">{label}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)]" />
    </div>
  );
}
