/**
 * Serper.dev Google SERP API client.
 *
 * Used by the researcher to see what's actually ranking for the client's
 * keywords — essential for identifying content gaps and topics that can
 * realistically rank.
 *
 * Set SERPER_API_KEY in environment to enable. If unset or the API fails,
 * the researcher falls back to prompt-only suggestions (lower quality).
 *
 * Docs: https://serper.dev/playground
 * Endpoint: POST https://google.serper.dev/search
 * Auth: X-API-KEY header
 * Free tier: 2,500 queries
 */

interface OrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface PeopleAlsoAsk {
  question: string;
  snippet?: string;
}

interface RelatedSearch {
  query: string;
}

interface SerperResponse {
  organic?: OrganicResult[];
  peopleAlsoAsk?: PeopleAlsoAsk[];
  relatedSearches?: RelatedSearch[];
  answerBox?: { title?: string; snippet?: string };
  knowledgeGraph?: { title?: string; description?: string };
}

export interface SerpAnalysis {
  keyword: string;
  organic: OrganicResult[];
  paa: string[];
  relatedSearches: string[];
  featuredSnippet: string | null;
  knowledgeGraph: string | null;
}

const API_URL = "https://google.serper.dev/search";

/**
 * Fetch SERP data for a single keyword. Returns a structured analysis or null
 * on failure (caller should skip gracefully).
 */
async function fetchSerp(
  keyword: string,
  opts: { gl?: string; hl?: string; num?: number } = {}
): Promise<SerpAnalysis | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  const { gl = "au", hl = "en", num = 10 } = opts;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: keyword, gl, hl, num }),
    });

    if (!res.ok) {
      console.error(
        `[serper] API error ${res.status} for "${keyword}":`,
        (await res.text()).slice(0, 200)
      );
      return null;
    }

    const data: SerperResponse = await res.json();

    return {
      keyword,
      organic: (data.organic || []).slice(0, 10),
      paa: (data.peopleAlsoAsk || []).map((q) => q.question).filter(Boolean),
      relatedSearches: (data.relatedSearches || []).map((r) => r.query).filter(Boolean),
      featuredSnippet: data.answerBox?.snippet || data.answerBox?.title || null,
      knowledgeGraph: data.knowledgeGraph?.description || data.knowledgeGraph?.title || null,
    };
  } catch (err) {
    console.error(`[serper] request failed for "${keyword}":`, err);
    return null;
  }
}

/**
 * Fetch SERP analyses for multiple keywords in parallel.
 * Returns only the ones that succeeded (failures filtered out silently).
 */
export async function analyzeKeywords(
  keywords: string[],
  opts?: { gl?: string; hl?: string }
): Promise<SerpAnalysis[]> {
  if (!process.env.SERPER_API_KEY || keywords.length === 0) return [];

  const results = await Promise.all(keywords.map((kw) => fetchSerp(kw, opts)));
  return results.filter((r): r is SerpAnalysis => r !== null);
}

/**
 * Format a SERP analysis into Markdown for inclusion in an LLM prompt.
 */
export function formatSerpForPrompt(analysis: SerpAnalysis): string {
  const lines: string[] = [];
  lines.push(`### Keyword: "${analysis.keyword}"`);

  if (analysis.featuredSnippet) {
    lines.push(`**Featured Snippet:** ${analysis.featuredSnippet.slice(0, 200)}`);
  }
  if (analysis.knowledgeGraph) {
    lines.push(`**Knowledge Graph:** ${analysis.knowledgeGraph.slice(0, 200)}`);
  }

  if (analysis.organic.length > 0) {
    lines.push(`\n**Top ${analysis.organic.length} ranking pages:**`);
    for (const r of analysis.organic) {
      lines.push(`${r.position}. [${r.title}](${r.link})`);
      if (r.snippet) lines.push(`   ${r.snippet.slice(0, 180)}`);
    }
  }

  if (analysis.paa.length > 0) {
    lines.push(`\n**People Also Ask:**`);
    for (const q of analysis.paa.slice(0, 8)) lines.push(`- ${q}`);
  }

  if (analysis.relatedSearches.length > 0) {
    lines.push(`\n**Related searches:**`);
    for (const q of analysis.relatedSearches.slice(0, 8)) lines.push(`- ${q}`);
  }

  return lines.join("\n");
}
