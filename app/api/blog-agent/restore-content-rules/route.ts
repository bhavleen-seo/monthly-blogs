import { NextResponse } from "next/server";
import { getGlobalSettings, saveGlobalSettings } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

const SEO_RULES = `Primary keyword in the first 100 words and naturally in the final paragraph. Use H2 for main sections (2–5 per post), H3 for subsections. Include at least 2 internal links and 1 authoritative external link per post. Build content around topic clusters — every blog should link to its pillar page and at least one related cluster post. Use semantic keyword variations and related entities throughout (avoid exact-match keyword stuffing). Include a concise, direct-answer paragraph (40–60 words) near the top of the post optimized for featured snippets and AI overviews. Structure at least one section as a FAQ using proper FAQ schema markup (Question + Answer pairs). Write meta titles under 60 characters with the primary keyword front-loaded. Write meta descriptions between 140–155 characters that include the keyword and a clear value proposition. Use descriptive, keyword-rich alt text on all images. Keep URLs short, lowercase, hyphenated, and keyword-relevant. Target one primary keyword and 3–5 semantically related secondary keywords per post. Use "People Also Ask" and related search queries as H2/H3 headings where natural. Ensure every post addresses search intent (informational, navigational, or transactional) within the first two scroll depths. Aim for a content depth that covers the topic comprehensively enough that no critical subtopic is left for the reader to search elsewhere.`;

const CONTENT_INSTRUCTIONS = `Write in a conversational but authoritative tone — the reader should feel like they're learning from a trusted expert, not reading a textbook. Open every post with a hook that acknowledges the reader's problem or question directly. Structure content using the inverted pyramid: lead with the clearest answer or takeaway, then expand with detail, context, and nuance. Include real-world examples, mini case studies, or data points to back up claims. Write in short paragraphs (2–4 sentences max) and use transition sentences between sections to maintain flow. Include actionable tips the reader can implement immediately — avoid vague advice. Naturally weave in question-based phrases that mirror how people ask voice assistants and AI chatbots (e.g., "What is...", "How do you...", "Why does..."). Write at least one section that gives a definitive, concise answer suitable for AI engines to extract and cite. Avoid filler, fluff, and obvious statements — every sentence should earn its place. End every post with a clear call-to-action tied to a business goal. Minimum word count: 1,200 words for standard posts, 2,000+ for pillar content. Include a TL;DR or key takeaways summary box for longer posts. Write for a Flesch reading ease score of 60–70 (accessible to a broad audience). Never publish thin content — if a topic can't sustain the minimum depth, combine it with a related topic.`;

/**
 * One-shot endpoint to restore the SEO rules and content instructions
 * that were lost during a bad save cycle. Safe to call multiple times
 * (overwrites only seoRules + contentInstructions, preserves everything else).
 *
 * DELETE THIS FILE after use.
 */
export async function POST() {
  try {
    const current = await getGlobalSettings();
    await saveGlobalSettings({
      ...current,
      seoRules: SEO_RULES,
      contentInstructions: CONTENT_INSTRUCTIONS,
    });
    const verified = await getGlobalSettings();
    return NextResponse.json({
      success: true,
      seoRulesLength: verified.seoRules.length,
      contentInstructionsLength: verified.contentInstructions.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
