import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion, BlogPost } from "./types";
import { getGlobalSettings } from "./store";
import { complete } from "./llm";
import { analyzeKeywords, inferRegion } from "./serper";
import { fetchPageContents, formatPageForPrompt } from "./youcom";
import { fetchSiteContext } from "./site-context";
import { fetchRecentPosts } from "./wp-posts";

function resolveCategories(client: Client): string[] {
  // Handle legacy string values stored before the form parsed correctly
  const raw = client.blogCategories as unknown;
  if (typeof raw === "string" && raw.trim()) {
    return (raw as string).split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(raw) && raw.length > 0) return raw as string[];
  // Derive a sensible default from industry when none is set
  const ind = (client.industry || "").toLowerCase();
  if (ind.includes("paint")) return ["Painting Tips", "Home Improvement"];
  if (ind.includes("fence") || ind.includes("metal fab")) return ["Fencing Tips", "Home Improvement"];
  if (ind.includes("pest")) return ["Pest Control", "Prevention Tips"];
  if (ind.includes("restaurant") || ind.includes("grill") || ind.includes("bbq") || ind.includes("food")) return ["Food & Dining", "Local Eats"];
  if (ind.includes("roof")) return ["Roofing Tips", "Home Maintenance"];
  if (ind.includes("landscap") || ind.includes("tree") || ind.includes("yard")) return ["Landscaping Tips", "Outdoor Living"];
  if (ind.includes("pool")) return ["Pool Care", "Maintenance Tips"];
  if (ind.includes("hvac") || ind.includes("air") || ind.includes("breez")) return ["HVAC Tips", "Home Comfort"];
  if (ind.includes("loan") || ind.includes("mortgage")) return ["Mortgage Tips", "Home Buying"];
  if (ind.includes("remodel")) return ["Remodeling", "Home Improvement"];
  if (ind.includes("vet") || ind.includes("pet")) return ["Pet Health", "Pet Care Tips"];
  if (ind.includes("security")) return ["Security Tips", "Home Safety"];
  if (ind.includes("collision") || ind.includes("auto")) return ["Auto Repair", "Car Care Tips"];
  return ["Blog"];
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Build SEO-friendly alt text from the image prompt / primary keyword. Kept
// local to the writer now that stock-image search has been removed — featured
// images are added manually from Freepik in the dashboard, but we still prefill
// a suggested alt so the pasted image gets good alt text on WordPress.
function buildAltText(featuredImagePrompt: string, primaryKeyword?: string): string {
  let text = (featuredImagePrompt || "").trim();
  if (!text) text = primaryKeyword || "Featured image";
  text = text.replace(/^(an?\s+)?(image|photo|picture|illustration)\s+of\s+/i, "");
  if (text.length <= 125) return text;
  const truncated = text.slice(0, 125);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated).trim();
}

// ─── Hardcoded core rules (always applied, never lost to KV issues) ──────────

const CORE_SEO_RULES = `
- Primary keyword in the first 100 words and naturally in the final paragraph.
- Use H2 for main sections (2–5 per post), H3 for subsections.
- Include exactly 8 internal links (5 service pages + 3 recent blog posts) and 2 authoritative external links per post — pulled ONLY from the link pool provided in the prompt, never invented.
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

// ─── AI-tell sanitization + detection ────────────────────────────────────────
// We CAN'T trust the model to avoid em dashes, smart quotes, etc. just by being
// told. So we strip them deterministically after generation. The prompt also
// bans them, but this layer is the guarantee.

function sanitizeAiArtifacts(text: string): string {
  return text
    // Em dash → comma+space (handles any surrounding spacing).
    .replace(/\s*—\s*/g, ", ")
    // En dash in numeric ranges → hyphen ("2020–2024" → "2020-2024").
    .replace(/(\d)\s*–\s*(\d)/g, "$1-$2")
    // Any other en dash → hyphen.
    .replace(/–/g, "-")
    // Smart double quotes → straight.
    .replace(/[“”]/g, '"')
    // Smart single quotes / apostrophes → straight.
    .replace(/[‘’]/g, "'")
    // Horizontal ellipsis → three dots.
    .replace(/…/g, "...")
    // Zero-width / BOM characters that some models leak in.
    .replace(/[​-‍﻿]/g, "")
    // Non-breaking space → regular space.
    .replace(/ /g, " ");
}

// Patterns that survived sanitization but still scream "AI wrote this".
// Kept short and high-confidence to minimize false positives in normal prose.
const AI_TELL_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bdelve(s|d|ing)?\b/gi,                                                 name: '"delve" / "delving"' },
  { pattern: /\btapestry\b/gi,                                                        name: '"tapestry"' },
  { pattern: /\bmyriad\b/gi,                                                          name: '"myriad"' },
  { pattern: /\bin today's\s+\w+/gi,                                                  name: '"in today\'s [X]"' },
  { pattern: /\bnavigate\s+the\s+(complex|complicated|tricky|nuanced|intricate|ever-evolving)\s+(world|landscape|realm)/gi, name: '"navigate the [X] world/landscape"' },
  { pattern: /\bharness\s+the\s+power\b/gi,                                           name: '"harness the power"' },
  { pattern: /\bthe\s+realm\s+of\b/gi,                                                name: '"the realm of"' },
  { pattern: /\ba\s+(wealth|plethora|myriad)\s+of\b/gi,                               name: '"a wealth/plethora of"' },
  { pattern: /\bit's\s+(important\s+to\s+note|worth\s+noting|worth\s+mentioning)\b/gi, name: '"it\'s important to note / worth noting"' },
  { pattern: /\bin\s+conclusion\b/gi,                                                 name: '"in conclusion"' },
  { pattern: /\b(furthermore|moreover)\b/gi,                                          name: '"furthermore" / "moreover"' },
  { pattern: /\bgame[-\s]?changer\b/gi,                                               name: '"game-changer"' },
  { pattern: /\b(ever-evolving|ever-changing|rapidly\s+evolving)\b/gi,                name: '"ever-evolving" / "rapidly evolving"' },
  { pattern: /\b(seamless(ly)?|leverage|synergy|holistic|paradigm)\b/gi,              name: 'corporate buzzword (seamless/leverage/synergy/etc.)' },
  { pattern: /^In\s+today's\b/gim,                                                    name: 'sentence starting with "In today\'s"' },
  { pattern: /^When\s+it\s+comes\s+to\b/gim,                                          name: 'sentence starting with "When it comes to"' },
  { pattern: /\blet's\s+(dive\s+into|explore)\b/gi,                                   name: '"let\'s dive into / explore"' },
];

function detectAiTells(html: string): string[] {
  // Strip HTML tags so patterns match on prose text only.
  const text = html.replace(/<[^>]+>/g, " ");
  const found = new Set<string>();
  for (const { pattern, name } of AI_TELL_PATTERNS) {
    if (pattern.test(text)) found.add(name);
  }
  return Array.from(found);
}

const BANNED_AI_TELLS = `
## BANNED — your output will be rejected if any of these appear
You will be tested for these. Use plain, specific writing instead.

**Symbols (NEVER use):**
- Em dashes (—) and en dashes (–) — use commas, periods, parentheses, or simple hyphens
- Smart/curly quotes ("" '' '') — use straight quotes (" ')
- Horizontal ellipsis (…) — use three regular dots (...)

**Words/phrases (NEVER use):**
- "delve", "delves into", "delving"
- "tapestry", "myriad", "realm", "plethora"
- "harness the power", "leverage", "synergy", "seamless", "holistic"
- "navigate the [complex/intricate/ever-evolving] [world/landscape/realm]"
- "in today's [anything]"
- "it's important to note", "it's worth noting/mentioning"
- "in conclusion" — just stop writing or end with the CTA
- "furthermore", "moreover" — use simpler transitions or none at all
- "a wealth of", "a plethora of", "a myriad of"
- "ever-evolving", "rapidly evolving", "game-changer", "cutting-edge"

**Sentence openers (NEVER start a sentence with):**
- "In today's ..."
- "When it comes to ..."
- "Let's dive into" / "Let's explore"
- "Whether you're ..."

**Style requirements (DO this instead):**
- Use specific numbers, names, places, dollar amounts — never "many businesses" or "various studies"
- Vary sentence length — short punchy ones mixed with longer ones
- Use contractions where natural ("don't", "isn't", "you'll")
- If you'd normally write an em dash, replace it with a comma or split into two sentences
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

## Page Title, H1 & URL Slug Rules
**Page Title (SEO <title> tag)** — shown in SERPs and browser tabs:
- MUST be under 60 characters.
- Front-load the primary keyword in the first 3-4 words.
- Keyword-dense, scannable, and optimized for CTR in search results.
- Can include year/numbers and brand suffix if space allows. When including a year, ALWAYS use the current year: CURRENT_YEAR_PLACEHOLDER.

**H1 Heading** — the big headline readers see on the page itself:
- MUST be DIFFERENT from the page title (never identical) — this is an SEO best practice.
- Can be longer (up to ~70 chars) and more conversational/benefit-driven.
- Still includes the primary keyword but can rephrase it naturally.
- Should feel welcoming and human, not keyword-stuffed.
- Example pair:
  - Page Title: "$200K Mortgage Income Requirements (2026 Guide)"
  - H1: "How Much Do You Need to Earn to Afford a $200,000 Home?"

**URL Slug**:
- MUST be short (3-5 words max), lowercase, hyphenated, keyword-rich.
- Remove stop words from slugs (a, the, and, or, in, of, for, to, is, etc.).
- Example: Page Title above → Slug: "income-needed-200k-mortgage"

ALWAYS generate an optimized page title AND a distinct H1 — do NOT just reuse the topic title verbatim, and never output the same text for both fields.
`.trim();

// ─── De-watermark pass ───────────────────────────────────────────────────────
// Rewrites Claude's output through a non-Anthropic model so the Claude text
// watermark (introduced Aug 2026, EU AI Act compliance) is not present in the
// published post. Falls back to the original content if the rewrite fails.

const DEFAULT_DEWATERMARK_MODEL = "openai/gpt-4o-mini";

async function deWatermark(
  parsed: { seoTitle?: string; h1?: string; content: string; excerpt: string; metaDescription: string; featuredImagePrompt: string },
  model: string
): Promise<typeof parsed> {
  try {
    const prompt = `You are a skilled editor. Rewrite the blog post JSON below so it reads as naturally human-written.

STRICT RULES:
- Return ONLY valid JSON with the same fields as the input — no extra text
- Preserve ALL HTML tags and attributes exactly, especially every href URL — do NOT alter any link
- Keep all heading tags (h2, h3) and the overall post structure
- Only rewrite the readable prose text between HTML tags, varying phrasing and sentence structure
- Preserve all facts, figures, and meaning — do not invent new claims
- Do NOT change the featuredImagePrompt field
- seoTitle, h1, excerpt, metaDescription may be lightly rephrased but must stay accurate

${JSON.stringify({ seoTitle: parsed.seoTitle, h1: parsed.h1, content: parsed.content, excerpt: parsed.excerpt, metaDescription: parsed.metaDescription, featuredImagePrompt: parsed.featuredImagePrompt })}`;

    const result = await complete({ model, prompt, maxTokens: 8192 });
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    const rewritten = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!rewritten?.content) throw new Error("empty content in response");
    console.log(`[writer] de-watermark pass complete (${model})`);
    return rewritten;
  } catch (err) {
    console.warn("[writer] de-watermark failed, using original content:", err);
    return parsed;
  }
}

// ─── Writer ──────────────────────────────────────────────────────────────────

export async function writeBlogPost(
  client: Client,
  topic: TopicSuggestion
): Promise<BlogPost> {
  const currentYear = new Date().getFullYear();
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

  const websiteUrl = client.websiteUrl || client.wordpressUrl;

  // Build the real pool of internal-link targets so the writer never invents
  // URLs. Service pages come from the homepage nav; blog posts come from the
  // client's WP REST API. Both calls no-op gracefully on failure.
  const [siteContext, recentPosts] = await Promise.all([
    fetchSiteContext(websiteUrl),
    fetchRecentPosts(client.wordpressUrl),
  ]);

  const servicePool = siteContext.servicePages
    .filter((p) => p.url !== topic.internalLinkTarget)
    .slice(0, 15);
  const blogPool = recentPosts.slice(0, 15);

  const servicePoolText = servicePool.length > 0
    ? servicePool.map((p) => `- ${p.url} — "${p.label}"`).join("\n")
    : "(none extracted from homepage nav — use only the primary service page above)";

  const blogPoolText = blogPool.length > 0
    ? blogPool.map((p) => `- ${p.url} — "${p.title}"`).join("\n")
    : "(no published posts yet on this site — skip this category and make up the slack with more service-page links if needed)";

  const linkPoolSection = `
# Real Internal Link Pool (USE ONLY THESE URLS — NEVER INVENT)
You MUST pick internal links ONLY from the URLs listed below. Do not guess or
fabricate any URL on ${websiteUrl}. If the URL you want isn't in this list,
don't link to it.

## Service / Money Pages on This Site
${topic.internalLinkTarget ? `- ${topic.internalLinkTarget} — primary service this post supports (link to this one for sure)\n` : ""}${servicePoolText}

## Recent Blog Posts on This Site
${blogPoolText}
`.trim();

  // Pull top 3 currently-ranking pages for the primary informational keyword
  // so the writer can outperform them on depth and differentiation.
  const primaryKeyword = topic.targetKeywords?.[0];
  const region = inferRegion(client.location);
  let competitorSection = "";
  if (primaryKeyword) {
    try {
      const [serp] = await analyzeKeywords([primaryKeyword], { gl: region, hl: "en" });
      const topUrls = (serp?.organic || [])
        .slice(0, 3)
        .map((r) => r.link)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
      if (topUrls.length > 0) {
        const pages = await fetchPageContents(topUrls, { formats: ["markdown"], crawlTimeout: 8 });
        if (pages.length > 0) {
          competitorSection = `\n\n# Currently Ranking Pages (study then beat them)
These are the top ${pages.length} pages ranking for "${primaryKeyword}" right now. Read them carefully. Your post must:
- Cover everything these pages cover — PLUS at least 2 angles/questions they miss
- Go deeper on the most important sub-topics (more specifics, examples, numbers)
- Be better structured (clearer headings, more scannable, better FAQ)
- Never duplicate their phrasing — write in the client's brand voice
- Surface newer data / ${currentYear} context where relevant

${pages.map((p) => formatPageForPrompt(p, 1500)).join("\n\n---\n\n")}`;
        }
      }
    } catch (err) {
      console.error("[writer] competitor content fetch failed:", err);
    }
  }

  const prompt = `You are an expert SEO blog writer. Write a complete, publication-ready blog post. You MUST follow every rule below — no exceptions.

# MANDATORY SEO RULES (follow ALL of these)
${CORE_SEO_RULES}${extraSeoRules}

# MANDATORY CONTENT INSTRUCTIONS (follow ALL of these)
${CORE_CONTENT_INSTRUCTIONS.replace("CURRENT_YEAR_PLACEHOLDER", String(currentYear))}${extraContentInstructions}

# ${BANNED_AI_TELLS}

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
${competitorSection}

${linkPoolSection}

# Partner Link (include when relevant)
If the post topic has a natural connection to digital marketing, SEO, online visibility, attracting more customers online, local business growth, or getting found on Google — include one link to https://khalismarketing.com.au (a Melbourne-based SEO agency) with natural anchor text that describes what it is (e.g. "SEO services", "digital marketing experts", "local SEO specialists"). Only include it where it genuinely fits the prose — skip it entirely if the topic has no marketing angle.

# Internal & External Linking Requirements (CRITICAL)
You MUST include EXACTLY:
- **5 internal links to service / money pages** — pick from the "Service / Money Pages" list above. If the primary service page is listed, link to it for sure. If fewer than 5 unique service pages are available in the pool, use as many as exist (do not invent extras).
- **3 internal links to recent blog posts** — pick from the "Recent Blog Posts" list above. If the pool is empty or smaller, use as many as exist (do not invent extras).
- **2 external links** to high-authority sources (government sites, industry publications, peer-reviewed studies, established trade bodies — NEVER competitors, NEVER content farms).

All links MUST be:
- Embedded naturally inside paragraph text with keyword-rich anchor text
- NEVER "click here", "learn more", or button-style CTAs
- Distributed across the post — not clumped in one section
- Each URL used only once (no duplicate links)
- Internal anchor text should describe the destination page, not the current article
- ALL links (internal and external) MUST include target="_blank" rel="noopener noreferrer" so they open in a new tab. Example: <a href="https://example.com/page" target="_blank" rel="noopener noreferrer">anchor text</a>

CRITICAL: If a URL is not in the link pool above, you may NOT link to it as an internal link. Hallucinated URLs cause 404s on the live site.

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
  "seoTitle": "Page title for <title> tag, under 60 chars, primary keyword front-loaded, optimized for SERP CTR.",
  "h1": "On-page H1 heading — MUST be different wording from seoTitle. Longer, conversational, reader-friendly. Up to ~70 chars.",
  "slug": "short-keyword-rich-slug (3-5 words, no stop words, lowercase, hyphenated)",
  "content": "<h2>...</h2><p>...</p>... (the full blog post HTML)",
  "excerpt": "150-160 character summary for search results",
  "metaDescription": "140-155 characters, includes primary keyword, clear value prop",
  "featuredImagePrompt": "2-4 word Pixabay stock photo search query — concrete nouns only, NO articles/prepositions/adjectives. For home/trade services always include 'residential' or 'house' to avoid matching non-American imagery (e.g. Asian rooftops). Good examples: 'pest control technician', 'residential roof replacement', 'body donation process', 'custom work uniforms', 'auto body collision repair', 'dumpster rental truck', 'residential plumbing repair', 'house painting exterior'. Must visually represent the core topic of this post."
}

Return ONLY the JSON object, no other text.`;

  const text = await complete({ model, prompt, maxTokens: 8192 });

  let parsed: {
    seoTitle?: string;
    h1?: string;
    slug?: string;
    content: string;
    excerpt: string;
    metaDescription: string;
    featuredImagePrompt: string;
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed) throw new Error("No JSON found");
  } catch {
    throw new Error(`Failed to parse blog post: ${text.slice(0, 200)}`);
  }

  // Rewrite through a non-Anthropic model to remove the Claude text watermark.
  const dwModel = settings.deWatermarkModel || DEFAULT_DEWATERMARK_MODEL;
  parsed = { ...parsed, ...await deWatermark(parsed, dwModel) };

  // Strip em dashes / smart quotes / ellipsis / etc. from every text field.
  // Done AFTER parse so we don't risk breaking the JSON, BEFORE detection so
  // the AI-tells warning only flags things the silent cleanup couldn't catch.
  // Also enforce target="_blank" on every link — the prompt asks for it but the
  // model doesn't always comply, so we fix it deterministically here.
  const enforceNewTab = (html: string) =>
    html.replace(/<a\s([^>]*?)>/gi, (match, attrs: string) => {
      if (/target\s*=/i.test(attrs)) return match;
      return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
    });
  const cleanContent  = enforceNewTab(sanitizeAiArtifacts(parsed.content));
  const cleanExcerpt  = sanitizeAiArtifacts(parsed.excerpt || "");
  const cleanMeta     = sanitizeAiArtifacts(parsed.metaDescription || "");
  const cleanSeoTitle = parsed.seoTitle ? sanitizeAiArtifacts(parsed.seoTitle) : undefined;
  const cleanH1       = parsed.h1 ? sanitizeAiArtifacts(parsed.h1) : undefined;

  const wordCount = cleanContent.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
  const finalTitle = cleanSeoTitle || topic.title;
  const finalSlug = parsed.slug || generateSlug(finalTitle);
  const finalH1 = cleanH1 && cleanH1 !== finalTitle ? cleanH1 : undefined;

  // Detect surviving AI tells in body + excerpt (titles are too short to flag).
  const aiTellsDetected = detectAiTells(`${cleanContent} ${cleanExcerpt}`);
  if (aiTellsDetected.length > 0) {
    console.warn(`[writer] AI tells survived in post "${finalTitle}":`, aiTellsDetected);
  }

  // Featured images are added manually by the SEO from Freepik in the dashboard
  // (paste → auto-resized to 750x500 → uploaded). The writer no longer searches
  // for or attaches any stock image. We still compute a suggested alt text from
  // the topic so the dashboard can prefill it for whatever image gets pasted in.
  const featuredImageAlt = buildAltText(parsed.featuredImagePrompt, primaryKeyword);

  return {
    id: uuidv4(),
    clientId: client.id,
    topicId: topic.id,
    title: finalTitle,
    h1: finalH1,
    slug: finalSlug,
    content: cleanContent,
    excerpt: cleanExcerpt,
    metaDescription: cleanMeta,
    targetKeywords: topic.targetKeywords,
    month: topic.month,
    categories: resolveCategories(client),
    tags: [],
    featuredImagePrompt: parsed.featuredImagePrompt,
    featuredImageUrl: undefined,
    freepikId: undefined,
    featuredImageAlt,
    wordCount,
    status: "ready",
    aiTellsDetected: aiTellsDetected.length > 0 ? aiTellsDetected : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
