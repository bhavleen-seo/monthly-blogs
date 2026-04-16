import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion } from "./types";
import { getTopics, getGlobalSettings } from "./store";
import { complete } from "./llm";
import { getPublishedPostTitles } from "./publisher";
import { getRelatedQuestions } from "./alsoasked";
import { analyzeKeywords, formatSerpForPrompt } from "./serper";

// Rough country/region mapping from free-text location for regionality
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
  const region = inferRegion(client.location);

  const pastTopics = await getTopics({ clientId: client.id });
  const pastTitles = pastTopics.map((t) => t.title).slice(-20);

  // Use up to 5 keywords for SERP analysis — more than that blows up the prompt
  const seedKeywords = client.keywords.slice(0, 5);

  // Fetch all three research signals in parallel.
  // All are best-effort: failure just reduces research quality.
  const [publishedTitles, relatedQuestions, serpAnalyses] = await Promise.all([
    getPublishedPostTitles(client),
    getRelatedQuestions(seedKeywords.slice(0, 3), { region, language: "en", limit: 25 }),
    analyzeKeywords(seedKeywords, { gl: region, hl: "en" }),
  ]);

  const globalRulesSection = [
    settings.seoRules && `## SEO Rules (MUST follow)\n${settings.seoRules}`,
    settings.contentInstructions && `## Content Instructions (MUST follow)\n${settings.contentInstructions}`,
    settings.avoidTopics && `## Topics to Avoid\n${settings.avoidTopics}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const serpSection = serpAnalyses.length > 0
    ? `## Live Google SERP Analysis (region: ${region.toUpperCase()})
Below are the actual top-ranking pages right now for the client's target keywords. Use this to find content gaps, weak spots in current rankings, and long-tail angles that aren't well-covered.

${serpAnalyses.map(formatSerpForPrompt).join("\n\n")}`
    : "## Live Google SERP Analysis\n(SERPER_API_KEY not configured — proceeding without live SERP data. Suggestions will be weaker without it.)";

  const prompt = `# Role
You are a senior SEO strategist with 10+ years of experience, specializing in topical authority and first-page rankings for small-to-mid-sized service businesses. You have deep expertise in:
- Content gap analysis using live SERP data
- Long-tail keyword opportunity identification
- Topical cluster architecture (pillar + supporting posts)
- E-E-A-T (Experience, Expertise, Authoritativeness, Trust) signals
- Local SEO for service businesses

Your #1 priority is to suggest topics that will help this client **build topical authority** in their niche AND have a realistic chance of **ranking on page 1 within 3–6 months**.

${globalRulesSection}

# Client Profile
- **Business:** ${client.businessName}
- **Industry:** ${client.industry}
- **Target Audience:** ${client.targetAudience}
- **Location:** ${client.location}
- **Website:** ${client.websiteUrl || client.wordpressUrl}
- **Brand Tone:** ${client.tone}
- **Primary Target Keywords:** ${client.keywords.join(", ")}
- **Blog Categories:** ${client.blogCategories.join(", ")}
${client.seoNotes ? `\n## Client-Specific SEO Instructions (MUST follow)\n${client.seoNotes}` : ""}

# Research Context

## Month: ${month}

${serpSection}

${
  relatedQuestions.length > 0
    ? `## People Also Asked (from AlsoAsked — real questions users type)
These are genuine search intents — the best topics often answer 2-3 of these in a single post.
${relatedQuestions.map((q) => `- ${q}`).join("\n")}

`
    : ""
}## Already Published on ${client.wordpressUrl} — STRICT EXCLUSIONS
Every topic you suggest MUST cover a distinctly different angle, subtopic, or intent than ALL of these. Do not suggest close variants or re-phrasings:
${publishedTitles.length > 0 ? publishedTitles.map((t) => `- ${t}`).join("\n") : "None fetched"}

## Previously Suggested (don't repeat):
${pastTitles.length > 0 ? pastTitles.map((t) => `- ${t}`).join("\n") : "None yet"}

# Your Task
Propose ${numTopics} blog topics. For each topic, apply this decision framework:

1. **Gap analysis:** Looking at the SERP data above, is there a question, angle, or sub-intent that the top 10 results are NOT answering well? Those are your opportunities.
2. **Ranking feasibility:** Can a new site realistically beat those top 10? Look for weak pages (thin content, old, not truly matching intent). Favor long-tail over head terms.
3. **Topical authority:** Does this topic reinforce ${client.businessName} as the go-to authority in ${client.industry}? Group topics into 2-3 topical clusters so the site builds density around key themes.
4. **Local intent:** Where possible, exploit local-specific angles for ${client.location} that national competitors can't match.
5. **User intent match:** Does this answer a real, commercially-relevant question from the target audience?

# Output Format
Return ONLY a JSON array, no other text. Each topic object must include:

\`\`\`json
[
  {
    "title": "SEO-friendly title, 50-70 characters, includes primary keyword naturally",
    "description": "2-3 sentences: what the post will cover and the unique angle vs. current SERP",
    "targetKeywords": ["primary keyword", "2-4 long-tail variants"],
    "estimatedSearchVolume": "high | medium | low",
    "rankingDifficulty": "easy | medium | hard",
    "topicalCluster": "The theme/pillar this post belongs to (group your ${numTopics} topics into 2-3 clusters)",
    "seoRationale": "1-2 sentences explaining WHY this can rank — reference specific SERP weaknesses, gaps, or intent mismatches you spotted. Be concrete."
  }
]
\`\`\`

Prioritize "easy" and "medium" ranking difficulty. Group topics into 2-3 clusters to build topical authority. Every topic must have strong commercial or informational intent for ${client.businessName}'s target audience.

Return ONLY the JSON array.`;

  const text = await complete({
    model: settings.model || "anthropic/claude-sonnet-4.5",
    prompt,
    maxTokens: 8192,
  });

  interface RawSuggestion {
    title: string;
    description: string;
    targetKeywords: string[];
    estimatedSearchVolume: "high" | "medium" | "low";
    rankingDifficulty?: "easy" | "medium" | "hard";
    topicalCluster?: string;
    seoRationale?: string;
  }

  let suggestions: RawSuggestion[];

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
    rankingDifficulty: s.rankingDifficulty,
    topicalCluster: s.topicalCluster,
    seoRationale: s.seoRationale,
    status: "pending" as const,
    month,
    createdAt: new Date().toISOString(),
  }));
}
