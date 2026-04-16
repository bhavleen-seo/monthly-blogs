"use client";

import { useState, useEffect } from "react";

const MODEL_GROUPS: { label: string; models: { id: string; label: string }[] }[] = [
  {
    label: "Anthropic (Claude)",
    models: [
      { id: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1 — Highest quality, most expensive" },
      { id: "anthropic/claude-opus-4", label: "Claude Opus 4 — Top-tier writing" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 — Recommended balance" },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 — Fast and capable" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet — Proven workhorse" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 — Fastest, cheapest Claude" },
    ],
  },
  {
    label: "OpenAI (GPT)",
    models: [
      { id: "openai/gpt-4o", label: "GPT-4o — Versatile, multimodal" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini — Very cheap" },
      { id: "openai/o1", label: "o1 — Reasoning model (slow, expensive)" },
      { id: "openai/o1-mini", label: "o1-mini — Reasoning, cheaper" },
      { id: "openai/gpt-4-turbo", label: "GPT-4 Turbo" },
    ],
  },
  {
    label: "Google (Gemini)",
    models: [
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash — Very fast" },
      { id: "google/gemini-pro-1.5", label: "Gemini 1.5 Pro — Long context (2M tokens)" },
      { id: "google/gemini-flash-1.5", label: "Gemini 1.5 Flash — Cheap" },
    ],
  },
  {
    label: "Meta (Llama — open source)",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B — Strong open model" },
      { id: "meta-llama/llama-3.1-405b-instruct", label: "Llama 3.1 405B — Largest open model" },
    ],
  },
  {
    label: "Other",
    models: [
      { id: "deepseek/deepseek-chat", label: "DeepSeek V3 — Cheap & capable" },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1 — Reasoning model" },
      { id: "mistralai/mistral-large", label: "Mistral Large" },
      { id: "x-ai/grok-2", label: "Grok 2" },
    ],
  },
];

const ALL_MODEL_IDS = new Set(MODEL_GROUPS.flatMap((g) => g.models.map((m) => m.id)));

function isCustomModel(id: string): boolean {
  return !ALL_MODEL_IDS.has(id);
}

export default function SettingsTab() {
  const [settings, setSettings] = useState({
    seoRules: "",
    contentInstructions: "",
    avoidTopics: "",
    preferredWordCount: { min: 1200, max: 1800 },
    model: "anthropic/claude-sonnet-4.5",
  });
  const [saved, setSaved] = useState(false);
  const [customModel, setCustomModel] = useState(false);

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
          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">Content Rules</h2>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">Global instructions that apply to all clients. Use per-client SEO notes for client-specific rules.</p>
        </div>
        <button
          onClick={handleSave}
          className={`px-5 py-2 rounded-lg text-sm font-medium text-[var(--color-primary-foreground)] transition-all ${saved ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)] hover:opacity-90"}`}
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
        <h3 className="font-semibold text-[var(--color-foreground)] mb-1">AI Model & Content Length</h3>
        <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
          Routed through OpenRouter. Pricing varies by model — check{" "}
          <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">openrouter.ai/models</a>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">AI Model</label>
            {!customModel && !isCustomModel(settings.model) ? (
              <select
                value={settings.model}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomModel(true);
                  } else {
                    setSettings({ ...settings, model: e.target.value });
                  }
                }}
                className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)]"
              >
                {MODEL_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </optgroup>
                ))}
                <option value="__custom__">Custom model ID…</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  placeholder="e.g. meta-llama/llama-3.3-70b-instruct"
                  className="flex-1 bg-[var(--color-muted)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-foreground)] placeholder-[var(--color-muted-foreground)] font-mono"
                />
                <button
                  type="button"
                  onClick={() => { setCustomModel(false); setSettings({ ...settings, model: "anthropic/claude-sonnet-4.5" }); }}
                  className="text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  Back to list
                </button>
              </div>
            )}
            <p className="text-[10px] text-[var(--color-muted-foreground)] mt-1.5">
              {customModel || isCustomModel(settings.model)
                ? <>Paste any OpenRouter model ID. Format: <code className="text-[var(--color-foreground)]">provider/model-name</code></>
                : <>Currently selected: <code className="text-[var(--color-foreground)]">{settings.model}</code></>}
            </p>
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
