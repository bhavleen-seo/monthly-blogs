/**
 * Site profiler — fetches a client's website (homepage + top service pages),
 * then uses an LLM to extract: what the business does, its services, commercial
 * keywords, and positioning notes for the researcher.
 *
 * The result is a ClientSiteProfile that is cached in KV so this only runs
 * once per client (or when the user clicks "Refresh Profile").
 */

import type { Client, ClientSiteProfile } from "./types";
import { fetchSiteContext } from "./site-context";
import { complete } from "./llm";
import { getGlobalSettings } from "./store";

const MAX_PAGE_TEXT = 1800; // chars per page sent to the LLM

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MonthlyBlogsAgent/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, MAX_PAGE_TEXT);
  } catch {
    return "";
  }
}

export async function buildClientProfile(client: Client): Promise<ClientSiteProfile> {
  const websiteUrl = client.websiteUrl || client.wordpressUrl;
  const settings = await getGlobalSettings();
  const model = settings.researchModel || settings.model || "anthropic/claude-sonnet-4.5";

  const siteCtx = await fetchSiteContext(websiteUrl);

  // Fetch homepage + up to 3 service pages in parallel
  const pagesToFetch = [
    websiteUrl,
    ...siteCtx.servicePages.slice(0, 3).map((p) => p.url),
  ];
  const pageTexts = await Promise.all(pagesToFetch.map(fetchPageText));

  const pageSection = pagesToFetch
    .map((url, i) => pageTexts[i] ? `### ${i === 0 ? "Homepage" : url}\n${pageTexts[i]}` : "")
    .filter(Boolean)
    .join("\n\n---\n\n");

  const navLinks = siteCtx.servicePages.length > 0
    ? siteCtx.servicePages.map((p) => `- ${p.label}: ${p.url}`).join("\n")
    : "(none extracted)";

  const prompt = `You are analyzing a business website to understand what the company does, what services they offer, and what commercial search keywords they should target.

## Business Info
- Name: ${client.businessName}
- Industry: ${client.industry}
- Location: ${client.location}
- Website: ${websiteUrl}

## Site Structure
Homepage title: ${siteCtx.homepageTitle || "(not available)"}
Homepage H1: ${siteCtx.h1 || "(not available)"}
Meta description: ${siteCtx.metaDescription || "(not available)"}

Navigation / service pages found:
${navLinks}

## Page Content
${pageSection || "(could not fetch page content — use the business info above)"}

## Your Task
Based on the website content above, extract:

1. **summary** — 2-3 sentences describing what this business does, who they serve, and their key differentiator. Write in third person. Be specific, not generic.

2. **services** — list of 5-10 specific services this business offers. Use short noun phrases (e.g. "Emergency pest control", "Termite inspections", "Roof replacement"). Pull directly from the page content.

3. **keywords** — list of 6-10 commercial (transactional) keywords this business should rank for. These are search terms real customers use when they're ready to hire. Include location modifiers where relevant (e.g. "pest control Phoenix AZ", "termite treatment Scottsdale"). Do NOT include blog/informational keywords.

4. **seoNotes** — 2-3 sentences of positioning guidance for the researcher. Include: the primary geographic area they serve, any notable differentiators (years in business, certifications, specialisms), and any content angles to emphasise or avoid.

Return ONLY valid JSON — no markdown, no explanation:
{
  "summary": "...",
  "services": ["...", "..."],
  "keywords": ["...", "..."],
  "seoNotes": "..."
}`;

  const text = await complete({ model, prompt, maxTokens: 1024 });

  let parsed: { summary?: string; services?: string[]; keywords?: string[]; seoNotes?: string };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    parsed = {};
  }

  return {
    clientId: client.id,
    websiteUrl,
    summary: parsed.summary || `${client.businessName} is a ${client.industry} business based in ${client.location}.`,
    services: parsed.services || [],
    keywords: parsed.keywords || client.keywords || [],
    seoNotes: parsed.seoNotes || client.seoNotes || "",
    analyzedAt: new Date().toISOString(),
  };
}
