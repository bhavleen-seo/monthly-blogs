import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion } from "./types";
import { getTopics, getGlobalSettings, getClientProfile, saveClientProfile } from "./store";
import { complete } from "./llm";
import { getPublishedPostTitles } from "./publisher";
import { getRelatedQuestions } from "./alsoasked";
import { analyzeKeywords, formatSerpForPrompt, inferRegion } from "./serper";
import { fetchSiteContext } from "./site-context";
import { buildClientProfile } from "./site-profiler";
import { fetchPageContents, formatPageForPrompt } from "./youcom";
import { fetchKeywordMetrics, formatMetricsForPrompt } from "./semrush";

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

  // Use the cached site profile for keywords + positioning. If no profile exists
  // (first run) or the website URL changed, build and cache it now.
  const websiteUrl = client.websiteUrl || client.wordpressUrl;
  let profile = await getClientProfile(client.id);
  if (!profile || profile.websiteUrl !== websiteUrl) {
    console.log(`[researcher] Building site profile for ${client.businessName}…`);
    try {
      profile = await buildClientProfile(client);
      await saveClientProfile(profile);
    } catch (err) {
      console.error(`[researcher] Site profile build failed for ${client.businessName}:`, err);
      // Non-fatal — fall back to manually entered keywords below
    }
  }

  // Use profile keywords if available, otherwise fall back to manually entered ones
  const seedKeywords = (profile?.keywords?.length ? profile.keywords : client.keywords).slice(0, 5);

  // Fetch all research signals in parallel.
  // All are best-effort: failure just reduces research quality.
  const [publishedTitles, relatedQuestions, serpAnalyses, siteContext, seedMetrics] = await Promise.all([
    getPublishedPostTitles(client),
    getRelatedQuestions(seedKeywords.slice(0, 3), { region, language: "en", limit: 25 }),
    analyzeKeywords(seedKeywords, { gl: region, hl: "en" }),
    fetchSiteContext(websiteUrl),
    fetchKeywordMetrics(seedKeywords, region),
  ]);

  const globalRulesSection = [
    settings.seoRules && `## SEO Rules (MUST follow)\n${settings.seoRules}`,
    settings.contentInstructions && `## Content Instructions (MUST follow)\n${settings.contentInstructions}`,
    settings.avoidTopics && `## Topics to Avoid\n${settings.avoidTopics}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Pull real page content for the #1 ranking page of each analyzed keyword.
  // Gives the LLM actual competitor content (not just snippets) to detect gaps.
  const competitorUrls = Array.from(
    new Set(
      serpAnalyses
        .map((a) => a.organic[0]?.link)
        .filter((u): u is string => typeof u === "string" && u.length > 0)
    )
  );
  const competitorPages = competitorUrls.length > 0
    ? await fetchPageContents(competitorUrls, { formats: ["markdown"], crawlTimeout: 8 })
    : [];

  const seedMetricsSection = seedMetrics.size > 0
    ? `## Real Keyword Metrics for Seed Keywords (SEMrush, live)
Use these REAL numbers to judge which commercial keywords are winnable vs. saturated. Avoid proposing blog topics whose primary keyword has zero search volume or a KD above ~55 (those won't rank).

${seedKeywords
  .map((kw) => {
    const m = seedMetrics.get(kw.toLowerCase().trim());
    return m ? `- ${formatMetricsForPrompt(m)}` : `- "${kw}" — no SEMrush data (treat with caution)`;
  })
  .join("\n")}`
    : "";

  const competitorContentSection = competitorPages.length > 0
    ? `## Top-Ranking Competitor Content (full page markdown)
These are the ACTUAL pages currently ranking #1 for the client's commercial keywords. Read them to identify:
- What depth of coverage Google is rewarding
- What informational questions they leave unanswered (your opportunity)
- What structure / sub-topics dominate the SERP

${competitorPages.map((p) => formatPageForPrompt(p, 1500)).join("\n\n---\n\n")}`
    : "";

  const serpSection = serpAnalyses.length > 0
    ? `## Live Google SERP Data for the Client's Commercial Keywords (region: ${region.toUpperCase()})
IMPORTANT: These are commercial (transactional) keywords. The top-ranking pages will almost always be SERVICE/LOCATION PAGES, NOT blog posts. This is expected and useful — it tells you what Google believes users want when they type these queries.

Use this data to understand:
- **The competitive landscape** — who's dominating these terms?
- **Real user sub-intents** via "People Also Ask" and "Related searches" — these reveal the INFORMATIONAL questions that sit alongside commercial intent. THESE are where your blog opportunities lie.
- **Content gaps the top pages don't cover** — questions left unanswered in service-page copy.

${serpAnalyses.map(formatSerpForPrompt).join("\n\n")}`
    : "## Live Google SERP Data\n(SERPER_API_KEY not configured — proceeding without live SERP data. Suggestions will be weaker without it.)";

  const siteContextSection = siteContext.servicePages.length > 0 || siteContext.homepageTitle
    ? `## Client's Existing Website Structure
**Homepage title:** ${siteContext.homepageTitle || "(not fetched)"}
**Meta description:** ${siteContext.metaDescription || "(not fetched)"}
**H1:** ${siteContext.h1 || "(not fetched)"}

**Service / money pages on the site (your internal link targets):**
${
  siteContext.servicePages.length > 0
    ? siteContext.servicePages.map((p) => `- ${p.label} → ${p.url}`).join("\n")
    : "(none extracted from nav)"
}

${siteContext.positioning ? `**Brand positioning (from homepage):** "${siteContext.positioning.slice(0, 400)}"` : ""}`
    : "## Client's Existing Website Structure\n(Could not fetch — make educated guesses about likely service pages based on the client's keywords.)";

  const prompt = `# Role
You are a senior SEO strategist with 10+ years of experience, specializing in **topical authority** and **topic cluster architecture** for service businesses. You understand that:

1. **Commercial/transactional keywords** (e.g. "emergency plumber phoenix", "home loans melbourne") should be targeted with SERVICE PAGES, not blog posts. Blog posts cannot realistically outrank service pages for these terms.

2. **Your job is NOT to propose blog posts that try to rank for commercial keywords.** Your job is to propose informational blog posts that **SUPPORT the commercial keywords** by:
   - Answering pre-purchase questions users search BEFORE they're ready to buy
   - Building topical authority around the commercial niche (so Google sees the site as an authority)
   - Capturing top-of-funnel and middle-of-funnel searches
   - Funneling readers toward the commercial service pages via contextual internal links

3. **Every blog post you propose must map to an existing commercial/service page** on the client's site and include an internal link to it. That's how topical authority compounds.

${globalRulesSection}

# Client Profile
- **Business:** ${client.businessName}
- **Industry:** ${client.industry}
- **Target Audience:** ${client.targetAudience}
- **Location:** ${client.location}
- **Website:** ${websiteUrl}
- **Brand Tone:** ${client.tone}
- **Commercial Target Keywords (money terms — DO NOT target blog posts at these directly):**
${seedKeywords.map((k) => `  - ${k}`).join("\n")}
- **Blog Categories:** ${client.blogCategories.join(", ")}
${profile?.summary ? `- **What this business does:** ${profile.summary}` : ""}
${profile?.services?.length ? `- **Their services:** ${profile.services.join(", ")}` : ""}
${(profile?.seoNotes || client.seoNotes) ? `\n## Client-Specific SEO Instructions (MUST follow)\n${profile?.seoNotes || client.seoNotes}` : ""}

# Research Context

## Publishing Month: ${month}

${siteContextSection}

${seedMetricsSection ? seedMetricsSection + "\n\n" : ""}${serpSection}

${competitorContentSection ? competitorContentSection + "\n\n" : ""}${
  relatedQuestions.length > 0
    ? `## People Also Asked (from AlsoAsked — the real informational questions users search)
These are GOLD. They reveal what real users want to KNOW (informational intent) around the commercial keywords. Your best topics will answer 2-4 of these in a single well-structured post.
${relatedQuestions.map((q) => `- ${q}`).join("\n")}

`
    : ""
}## Already Published on ${client.wordpressUrl} — STRICT EXCLUSIONS
Every topic you suggest MUST cover a distinctly different angle than ALL of these:
${publishedTitles.length > 0 ? publishedTitles.map((t) => `- ${t}`).join("\n") : "None fetched"}

## Previously Suggested (don't repeat):
${pastTitles.length > 0 ? pastTitles.map((t) => `- ${t}`).join("\n") : "None yet"}

# Your Decision Framework
For each blog topic, work backwards from a commercial keyword:

1. **Pick a commercial keyword** from the client's list above.
2. **Identify an informational sub-intent** that sits upstream of that commercial keyword. Use the PAA, related searches, and your own knowledge of the niche.
3. **Check feasibility:** Can a well-written blog post realistically rank page 1 for this informational query within 3-6 months? Look at SERP weakness, content thinness, answer gaps.
4. **Check topical contribution:** Does this post reinforce a specific topical cluster? (Group your ${numTopics} topics into 2-3 clusters so authority compounds.)
5. **Identify the internal link target:** Which service page on the site should this blog post link to? (Use the service pages extracted above. If none match, reference the commercial keyword as the implicit target.)
6. **Tag the funnel stage:**
   - **TOFU** (Top of Funnel): awareness-stage — users don't even know they have a problem yet
   - **MOFU** (Middle): users are researching solutions and comparing options
   - **BOFU** (Bottom): users are ready to buy — "best", "cost", "near me" modifiers

Aim for a mix: roughly 40% TOFU, 40% MOFU, 20% BOFU. TOFU builds authority, BOFU drives conversions.

# Output Format
Return ONLY a JSON array, no other text. ${numTopics} topics, each with all fields:

\`\`\`json
[
  {
    "title": "SEO-friendly title, 50-70 chars, includes the INFORMATIONAL keyword (not commercial)",
    "description": "2-3 sentences: what the post covers + the unique angle vs current SERP",
    "targetKeywords": ["informational primary keyword", "2-4 long-tail variants"],
    "estimatedSearchVolume": "high | medium | low",
    "rankingDifficulty": "easy | medium | hard",
    "topicalCluster": "Theme this belongs to. Group ${numTopics} topics into 2-3 clusters.",
    "supportsCommercialKeyword": "The commercial keyword from the client's list that this post supports",
    "funnelStage": "TOFU | MOFU | BOFU",
    "internalLinkTarget": "URL of the service page on client's site to link to (or the commercial keyword if no specific URL known)",
    "seoRationale": "1-2 sentences: WHY this can rank. Cite specific SERP gap, weakness in top 10, or PAA question that's poorly answered. Be concrete, don't be generic."
  }
]
\`\`\`

Return ONLY the JSON array.`;

  const text = await complete({
    model: settings.researchModel || settings.model || "anthropic/claude-sonnet-4.5",
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
    supportsCommercialKeyword?: string;
    funnelStage?: "TOFU" | "MOFU" | "BOFU";
    internalLinkTarget?: string;
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

  // Validate each suggested topic against real SEMrush metrics.
  // Drop zero-volume topics (no demand). Annotate the rest with real numbers.
  const topicPrimaryKeywords = suggestions
    .map((s) => s.targetKeywords?.[0])
    .filter((k): k is string => typeof k === "string" && k.length > 0);
  const topicMetrics = await fetchKeywordMetrics(topicPrimaryKeywords, region);

  const validated = suggestions
    .map((s) => {
      const primary = s.targetKeywords?.[0]?.toLowerCase().trim();
      const m = primary ? topicMetrics.get(primary) : undefined;
      return { s, m };
    })
    // If SEMrush returned metrics and volume is 0, drop the topic.
    // If SEMrush had no data at all for the keyword, keep it (fall back to LLM estimate).
    .filter(({ m }) => !(m && m.volume === 0));

  return validated.map(({ s, m }) => ({
    id: uuidv4(),
    clientId: client.id,
    title: s.title,
    description: s.description,
    targetKeywords: s.targetKeywords,
    estimatedSearchVolume: s.estimatedSearchVolume,
    searchVolume: m?.volume,
    keywordDifficulty: m?.difficulty ?? undefined,
    cpc: m?.cpc,
    rankingDifficulty: s.rankingDifficulty,
    topicalCluster: s.topicalCluster,
    supportsCommercialKeyword: s.supportsCommercialKeyword,
    funnelStage: s.funnelStage,
    internalLinkTarget: s.internalLinkTarget,
    seoRationale: s.seoRationale,
    status: "pending" as const,
    month,
    createdAt: new Date().toISOString(),
  }));
}
