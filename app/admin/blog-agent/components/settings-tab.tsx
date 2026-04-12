"use client";

import { useState, useEffect } from "react";

export default function SettingsTab() {
  const [settings, setSettings] = useState({
    seoRules: "",
    contentInstructions: "",
    avoidTopics: "",
    preferredWordCount: { min: 1200, max: 1800 },
    model: "claude-opus-4-6",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/blog-agent/settings")
      .then((r) => r.json())
      .then((data) => { if (data.settings) setSettings(data.settings); });
  }, []);

  const handleSave = async () => {
    await fetch("/api/blog-agent/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">Global SEO Settings</h2>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">Rules that apply to all clients.</p>
        </div>
        <button
          onClick={handleSave}
          className={`px-5 py-2 rounded-lg text-sm font-medium text-white transition-all ${saved ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)] hover:opacity-90"}`}
        >
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6 space-y-6">
        <Field label="SEO Rules" hint="Keyword placement, heading structure, internal linking rules.">
          <textarea
            value={settings.seoRules}
            onChange={(e) => setSettings({ ...settings, seoRules: e.target.value })}
            rows={5}
            placeholder="- Primary keyword in first 100 words&#10;- Use H2 for main sections, H3 for subsections&#10;- Include at least 2 internal links"
            className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)] resize-y"
          />
        </Field>

        <Field label="Content Instructions" hint="Writing style, tone guidelines, content requirements.">
          <textarea
            value={settings.contentInstructions}
            onChange={(e) => setSettings({ ...settings, contentInstructions: e.target.value })}
            rows={5}
            placeholder="- Write in a conversational but professional tone&#10;- Include real-world examples and actionable tips&#10;- End every post with a clear call-to-action"
            className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)] resize-y"
          />
        </Field>

        <Field label="Topics to Avoid" hint="Topics or themes the AI should never write about.">
          <textarea
            value={settings.avoidTopics}
            onChange={(e) => setSettings({ ...settings, avoidTopics: e.target.value })}
            rows={3}
            placeholder="- No political or religious content&#10;- Avoid competitor mentions by name"
            className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)] resize-y"
          />
        </Field>
      </div>

      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-6">
        <h3 className="font-semibold text-[var(--color-foreground)] mb-4">AI Model & Content Length</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">AI Model</label>
            <select
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]"
            >
              <option value="claude-opus-4-6">Claude Opus 4.6 (Best)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Fast)</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Cheapest)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Min Words</label>
            <input type="number" value={settings.preferredWordCount.min} onChange={(e) => setSettings({ ...settings, preferredWordCount: { ...settings.preferredWordCount, min: parseInt(e.target.value) || 800 } })} className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Max Words</label>
            <input type="number" value={settings.preferredWordCount.max} onChange={(e) => setSettings({ ...settings, preferredWordCount: { ...settings.preferredWordCount, max: parseInt(e.target.value) || 2000 } })} className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1">{label}</label>
      <p className="text-xs text-[var(--color-muted-foreground)] mb-2">{hint}</p>
      {children}
    </div>
  );
}
