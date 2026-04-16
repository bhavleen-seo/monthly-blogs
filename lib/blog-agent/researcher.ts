import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion } from "./types";
import { getTopics, getGlobalSettings } from "./store";
import { complete } from "./llm";
import { getPublishedPostTitles } from "./publisher";
import { getRelatedQuestions } from "./alsoasked";

// Rough country/region mapping from free-text location for AlsoAsked regionality
function inferRegion(location: string): string {
  const loc = location.toLowerCase();
  if (/\b(au|australia|melbourne|sydney|brisbane|perth|adelaide|queensland|nsw|victoria)\b/.test(loc)) return "au";
  if (/\b(us|usa|united states|america|california|texas|new york|florida|arizona)\b/.test(loc)) return "us";
  if (/\b(uk|united kingdom|britain|england|london|scotland|wales)\b/.test(loc)) return "gb";
  if (/\b(ca|canada|toronto|vancouver|ontario|quebec)\b/.test(loc)) return "ca";
  if (/\b(nz|new zealand|auckland|wellington)\b/.test(loc)) return "nz";
  return "au"; // CS Design Studios default
}

export async function researchTopics(
  client: Client,
  month: string,
  count?: number
): Promise<TopicSuggestion[]> {
  const numTopics = count || Math.max(5, client.postsPerMonth * 2);
  const settings = await getGlobalSettings();

  const pastTopics = await getTopics({ clientId: client.id });
  const pastTitles = pastTopics.map((t) => t.title).slice(-20);

  // Fetch in parallel: already-published posts on the client's WP site, and
  // "People Also Asked" questions grounded in their target keywords. Both are
  // best-effort — failures just reduce research quality, not break the flow.
  const [publishedTitles, relatedQuestions] = await Promise.all([
    getPublishedPostTitles(client),
    getRelatedQuestions(client.keywords.slice(0, 3), {
      region: inferRegion(client.location),
      language: "en",
      limit: 25,
    }),
  ]);

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

## Previously Suggested Topics (avoid repeating):
${pastTitles.length > 0 ? pastTitles.map((t) => `- ${t}`).join("\n") : "None yet"}

## Already Published on Client's Website — DO NOT SUGGEST DUPLICATES OR CLOSE VARIANTS
These are posts that already exist on ${client.wordpressUrl}. Every topic you suggest MUST cover a distinctly different angle, subtopic, or search intent than ANY of these:
${publishedTitles.length > 0 ? publishedTitles.map((t) => `- ${t}`).join("\n") : "None fetched"}

${
  relatedQuestions.length > 0
    ? `## Real "People Also Asked" Questions (from Google, via AlsoAsked)
Use these as inspiration for what real users are searching for. Strong topics often answer one or more of these questions:
${relatedQuestions.map((q) => `- ${q}`).join("\n")}

`
    : ""
}## Task
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

  const text = await complete({
    model: settings.model || "anthropic/claude-sonnet-4.5",
    prompt,
    maxTokens: 4096,
  });

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

  if (suggestions.length === 0) {
    throw new Error(`Model returned no topics. First 200 chars of response: ${text.slice(0, 200)}`);
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
