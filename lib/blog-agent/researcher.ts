import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion } from "./types";
import { getTopics, getGlobalSettings } from "./store";

const anthropic = new Anthropic();

export async function researchTopics(
  client: Client,
  month: string,
  count?: number
): Promise<TopicSuggestion[]> {
  const numTopics = count || Math.max(5, client.postsPerMonth * 2);
  const settings = await getGlobalSettings();

  const pastTopics = await getTopics({ clientId: client.id });
  const pastTitles = pastTopics.map((t) => t.title).slice(-20);

  const globalRulesSection = [
    settings.seoRules && `## SEO Rules (MUST follow)\n${settings.seoRules}`,
    settings.contentInstructions && `## Content Instructions (MUST follow)\n${settings.contentInstructions}`,
    settings.avoidTopics && `## Topics to Avoid\n${settings.avoidTopics}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `You are a senior content strategist at CS Design Studios, a digital marketing agency. Your job is to research and propose blog topics for a client.

${globalRulesSection}

## Client Profile
- **Business:** ${client.businessName}
- **Industry:** ${client.industry}
- **Target Audience:** ${client.targetAudience}
- **Location:** ${client.location}
- **Brand Tone:** ${client.tone}
- **Target Keywords:** ${client.keywords.join(", ")}
- **Blog Categories:** ${client.blogCategories.join(", ")}
${client.seoNotes ? `\n## Client-Specific SEO Instructions (MUST follow)\n${client.seoNotes}` : ""}

## Month: ${month}

## Previously Written Topics (avoid repeating):
${pastTitles.length > 0 ? pastTitles.map((t) => `- ${t}`).join("\n") : "None yet"}

## Task
Generate ${numTopics} unique, SEO-optimized blog topic suggestions for this client for ${month}. For each topic:

1. **Title** — Compelling, SEO-friendly blog title (50-70 characters)
2. **Description** — 2-3 sentence overview of what the post would cover
3. **Target Keywords** — 3-5 keywords to target
4. **Estimated Search Volume** — "high", "medium", or "low"

Consider:
- Current trends and seasonality for ${month}
- The client's industry and target audience
- Local relevance to ${client.location}
- Search intent and keyword opportunity
- Topics that establish authority and drive organic traffic

Respond in JSON format as an array:
[
  {
    "title": "...",
    "description": "...",
    "targetKeywords": ["...", "..."],
    "estimatedSearchVolume": "high|medium|low"
  }
]

Return ONLY the JSON array, no other text.`;

  const response = await anthropic.messages.create({
    model: settings.model || "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  let suggestions: Array<{
    title: string;
    description: string;
    targetKeywords: string[];
    estimatedSearchVolume: "high" | "medium" | "low";
  }>;

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    throw new Error(`Failed to parse topic suggestions: ${text.slice(0, 200)}`);
  }

  return suggestions.map((s) => ({
    id: uuidv4(),
    clientId: client.id,
    title: s.title,
    description: s.description,
    targetKeywords: s.targetKeywords,
    estimatedSearchVolume: s.estimatedSearchVolume,
    status: "pending" as const,
    month,
    createdAt: new Date().toISOString(),
  }));
}
