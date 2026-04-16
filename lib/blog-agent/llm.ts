/**
 * OpenRouter LLM client — OpenAI-compatible API at https://openrouter.ai
 * Uses OPENROUTER_API_KEY. Model IDs use the "provider/model" format, e.g.
 * "anthropic/claude-sonnet-4.5", "anthropic/claude-opus-4".
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface CompleteOptions {
  model: string;
  prompt: string;
  maxTokens: number;
}

export async function complete({ model, prompt, maxTokens }: CompleteOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set in environment");
  }

  // Translate legacy Anthropic-native model IDs to valid OpenRouter IDs.
  // Old saved settings may have values like "claude-opus-4-6" which don't
  // exist on OpenRouter; map them to the closest current OpenRouter model.
  const LEGACY_MAP: Record<string, string> = {
    "claude-opus-4-6": "anthropic/claude-opus-4.1",
    "claude-opus-4": "anthropic/claude-opus-4",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4.5",
    "claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
    "claude-sonnet-4": "anthropic/claude-sonnet-4",
    "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
  };
  const normalizedModel =
    LEGACY_MAP[model] || (model.includes("/") ? model : `anthropic/${model}`);

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://monthly-blogs.vercel.app",
      "X-Title": "Monthly Blogs Agent",
    },
    body: JSON.stringify({
      model: normalizedModel,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`Unexpected OpenRouter response shape: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return text;
}
