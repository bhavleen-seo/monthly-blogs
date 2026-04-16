import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion, BlogPost } from "./types";
import { getGlobalSettings } from "./store";
import { complete } from "./llm";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Hardcoded core rules (always applied, never lost to KV issues) ──────────

const CORE_SEO_RULES = `
- Primary keyword in the first 100 words and naturally in the final paragraph.
- Use H2 for main sections (2–5 per post), H3 for subsections.
- Include at least 2 internal links and 1 authoritative external link per post.
- Build content around topic clusters — every blog should link to its pillar page and at least one related cluster post.
- Use semantic keyword variations and related entities throughout (avoid exact-match keyword stuffing).
- Include a concise, direct-answer paragraph (40–60 words) near the top of the post optimized for featured snippets and AI overviews.
- Structure at least one section as a FAQ using proper FAQ schema markup (Question + Answer pairs).
- Write meta titles under 60 characters with the primary keyword front-loaded.
- Write meta descriptions between 140–155 characters that include the keyword and a clear value proposition.
- Use descriptive, keyword-rich alt text on all images.
- Keep URLs short, lowercase, hyphenated, and keyword-relevant.
- Target one primary keyword and 3–5 semantically related secondary keywords per post.
- Use "People Also Ask" and related search queries as H2/H3 headings where natural.
- Ensure every post addresses search intent (informational, navigational, or transactional) within the first two scroll depths.
- Aim for a content depth that covers the topic comprehensively enough that no critical subtopic is left for the reader to search elsewhere.
`.trim();

const CORE_CONTENT_INSTRUCTIONS = `
- Write in a conversational but authoritative tone — the reader should feel like they're learning from a trusted expert, not reading a textbook.
- Open every post with a hook that acknowledges the reader's problem or question directly.
- Structure content using the inverted pyramid: lead with the clearest answer or takeaway, then expand with detail, context, and nuance.
- Include real-world examples, mini case studies, or data points to back up claims.
- Write in short paragraphs (2–4 sentences max) and use transition sentences between sections to maintain flow.
- Include actionable tips the reader can implement immediately — avoid vague advice.
- Naturally weave in question-based phrases that mirror how people ask voice assistants and AI chatbots (e.g., "What is…", "How do you…", "Why does…").
- Write at least one section that gives a definitive, concise answer suitable for AI engines to extract and cite.
- Avoid filler, fluff, and obvious statements — every sentence should earn its place.
- End every post with a clear call-to-action tied to a business goal.
- Never publish thin content — if a topic can't sustain the minimum depth, combine it with a related topic.

## Page Title & URL Slug Rules
- The page title (H1 / SEO title) MUST be under 60 characters.
- Front-load the primary keyword in the title (first 3-4 words).
- Make the title compelling — it should promise a clear benefit or answer.
- The URL slug MUST be short (3-5 words max), lowercase, hyphenated, keyword-rich.
- Remove stop words from slugs (a, the, and, or, in, of, for, to, is, etc.).
- Example: Title "How Much Income Do You Need for a $200K Mortgage in 2026?" → Slug: "income-needed-200k-mortgage"
- ALWAYS generate an optimized title — do NOT just reuse the topic title verbatim if it's too long or not keyword-optimized.
`.trim();

// ─── Writer ──────────────────────────────────────────────────────────────────

export async function writeBlogPost(
  client: Client,
  topic: TopicSuggestion
): Promise<BlogPost> {
  const settings = await getGlobalSettings();
  const { min: minWords, max: maxWords } = settings.preferredWordCount;
  const model = settings.writerModel || settings.model || "anthropic/claude-sonnet-4.5";

  console.log(`[writer] Model: ${model}, Min: ${minWords}, Max: ${maxWords}`);

  // KV-stored rules are ADDITIVE on top of the hardcoded core rules.
  // Even if KV is empty, the core rules always apply.
  const extraSeoRules = settings.seoRules
    ? `\n\n## Additional SEO Rules from Settings (also mandatory)\n${settings.seoRules}`
    : "";
  const extraContentInstructions = settings.contentInstructions
    ? `\n\n## Additional Content Instructions from Settings (also mandatory)\n${settings.contentInstructions}`
    : "";

  const internalLinkTargets: string[] = [];
  if (topic.internalLinkTarget) internalLinkTargets.push(topic.internalLinkTarget);
  const websiteUrl = client.websiteUrl || client.wordpressUrl;

  const prompt = `You are an expert SEO blog writer. Write a complete, publication-ready blog post. You MUST follow every rule below — no exceptions.

# MANDATORY SEO RULES (follow ALL of these)
${CORE_SEO_RULES}${extraSeoRules}

# MANDATORY CONTENT INSTRUCTIONS (follow ALL of these)
${CORE_CONTENT_INSTRUCTIONS}${extraContentInstructions}

# Client Profile
- **Business:** ${client.businessName}
- **Industry:** ${client.industry}
- **Target Audience:** ${client.targetAudience}
- **Location:** ${client.location}
- **Website:** ${websiteUrl}
- **Brand Tone:** ${client.tone}

# Blog Topic
- **Title:** ${topic.title}
- **Description:** ${topic.description}
- **Target Keywords:** ${topic.targetKeywords.join(", ")}
${topic.supportsCommercialKeyword ? `- **Supporting commercial keyword:** "${topic.supportsCommercialKeyword}" — funnel readers toward this service naturally.` : ""}
${topic.funnelStage ? `- **Funnel stage:** ${topic.funnelStage} — ${topic.funnelStage === "TOFU" ? "educate and build trust, soft CTAs" : topic.funnelStage === "MOFU" ? "compare options, address objections, nudge toward service" : "decision-stage — clear CTA with service link"}` : ""}

# Internal Linking Requirements (CRITICAL)
You MUST include at least 2 internal links to pages on ${websiteUrl}. These should be:
1. ${topic.internalLinkTarget ? `Link to the primary service page: ${topic.internalLinkTarget}` : `A link to the most relevant service page on ${websiteUrl}`}
2. A link to another relevant page, blog post, or service category on ${websiteUrl}

Internal links MUST be:
- Embedded naturally within paragraph text using keyword-rich anchor text
- NOT standalone buttons, banners, or "click here" CTAs
- Distributed throughout the post (not all in one section)

You MUST also include at least 1 authoritative external link to a high-authority source (government site, industry publication, research study — NOT a competitor).

# Word Count
Write ${minWords}–${maxWords} words. If the topic demands more depth, go up to ${Math.round(maxWords * 1.2)}. Never go below ${minWords}.

# HTML Formatting
- Use semantic HTML: h2, h3, p, ul, ol, strong, em, blockquote, a (with href)
- Do NOT include the h1 title — WordPress adds that automatically
- Include at least one FAQ section using this structure:
  <h2>Frequently Asked Questions</h2>
  <h3>Question here?</h3>
  <p>Answer here.</p>

# Output Format
Return ONLY a JSON object with these fields:
{
  "seoTitle": "Optimized page title, under 60 chars, primary keyword front-loaded. Do NOT just copy the topic title — optimize it for search.",
  "slug": "short-keyword-rich-slug (3-5 words, no stop words, lowercase, hyphenated)",
  "content": "<h2>...</h2><p>...</p>... (the full blog post HTML)",
  "excerpt": "150-160 character summary for search results",
  "metaDescription": "140-155 characters, includes primary keyword, clear value prop",
  "tags": ["tag1", "tag2", "..."],
  "featuredImagePrompt": "A detailed description for generating a featured image"
}

Return ONLY the JSON object, no other text.`;

  const text = await complete({ model, prompt, maxTokens: 8192 });

  let parsed: {
    seoTitle?: string;
    slug?: string;
    content: string;
    excerpt: string;
    metaDescription: string;
    tags: string[];
    featuredImagePrompt: string;
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed) throw new Error("No JSON found");
  } catch {
    throw new Error(`Failed to parse blog post: ${text.slice(0, 200)}`);
  }

  const wordCount = parsed.content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
  const finalTitle = parsed.seoTitle || topic.title;
  const finalSlug = parsed.slug || generateSlug(finalTitle);

  return {
    id: uuidv4(),
    clientId: client.id,
    topicId: topic.id,
    title: finalTitle,
    slug: finalSlug,
    content: parsed.content,
    excerpt: parsed.excerpt,
    metaDescription: parsed.metaDescription,
    targetKeywords: topic.targetKeywords,
    categories: client.blogCategories,
    tags: parsed.tags,
    featuredImagePrompt: parsed.featuredImagePrompt,
    wordCount,
    status: "ready",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
