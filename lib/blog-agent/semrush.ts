/**
 * SEMrush API client — keyword metrics (volume, difficulty, CPC).
 *
 * Used by the researcher to replace LLM guesses ("high/medium/low") with
 * real search data for seed keywords and LLM-suggested topic keywords.
 *
 * Set SEMRUSH_API_KEY in environment to enable. If unset or the API fails,
 * callers get [] back and the researcher falls back to LLM estimates.
 *
 * Docs: https://developer.semrush.com/api/v3/analytics/keyword-reports/
 * Endpoint: GET https://api.semrush.com/
 * Auth: `key` query param
 * Pricing: 10 API units per keyword for phrase_this (live)
 *
 * Response format: CSV with semicolon separator, first row is headers.
 * Example:
 *   Ph;Nq;Cp;Co;Nr;Kd
 *   home loans melbourne;4400;12.40;0.95;123000000;68
 */

const ENDPOINT = "https://api.semrush.com/";

export interface KeywordMetrics {
  keyword: string;
  /** Monthly search volume */
  volume: number;
  /** Keyword difficulty, 0-100 (higher = harder to rank) */
  difficulty: number | null;
  /** Cost per click in USD */
  cpc: number;
  /** Paid competition, 0-1 */
  competition: number;
  /** Number of results Google returns */
  numResults: number;
}

/**
 * Map our region codes to SEMrush database codes. SEMrush doesn't have NZ,
 * so fall back to AU for Kiwi clients.
 */
function regionToDatabase(region: string): string {
  const supported = new Set(["us", "uk", "au", "ca", "de", "fr", "es", "it", "nl", "in", "za", "br", "mx"]);
  if (supported.has(region)) return region;
  if (region === "nz") return "au";
  return "au";
}

/**
 * Parse SEMrush semicolon-delimited CSV into rows.
 * Returns [] on empty / error responses. SEMrush returns the literal string
 * "ERROR 50 :: NOTHING FOUND" (no header) when a keyword has no data.
 */
function parseSemrushCsv(text: string): Record<string, string>[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("ERROR")) return [];
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

/**
 * Fetch live volume, difficulty, CPC, and competition for a single keyword.
 * Returns null on miss so callers can skip individual keywords without
 * aborting the whole batch.
 */
async function fetchKeywordOverview(
  keyword: string,
  database: string,
  apiKey: string
): Promise<KeywordMetrics | null> {
  const params = new URLSearchParams({
    type: "phrase_this",
    phrase: keyword,
    database,
    export_columns: "Ph,Nq,Cp,Co,Nr,Kd",
    key: apiKey,
  });

  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "text/csv" },
    });

    if (!res.ok) {
      console.error(`[semrush] ${res.status} for "${keyword}":`, (await res.text()).slice(0, 200));
      return null;
    }

    const rows = parseSemrushCsv(await res.text());
    if (rows.length === 0) return null;
    const r = rows[0];

    return {
      keyword,
      volume: parseInt(r.Nq || "0", 10) || 0,
      difficulty: r.Kd ? parseFloat(r.Kd) : null,
      cpc: r.Cp ? parseFloat(r.Cp) : 0,
      competition: r.Co ? parseFloat(r.Co) : 0,
      numResults: parseInt(r.Nr || "0", 10) || 0,
    };
  } catch (err) {
    console.error(`[semrush] fetch failed for "${keyword}":`, err);
    return null;
  }
}

/**
 * Fetch metrics for multiple keywords in parallel.
 * Returns a map keyed by the original keyword string (lowercased, trimmed).
 * Missing keywords simply have no entry in the map.
 */
export async function fetchKeywordMetrics(
  keywords: string[],
  region: string = "au"
): Promise<Map<string, KeywordMetrics>> {
  const apiKey = process.env.SEMRUSH_API_KEY;
  const out = new Map<string, KeywordMetrics>();

  if (!apiKey) {
    console.warn("[semrush] SEMRUSH_API_KEY not set — skipping keyword metrics");
    return out;
  }
  if (keywords.length === 0) return out;

  const database = regionToDatabase(region);
  const unique = Array.from(new Set(keywords.map((k) => k.toLowerCase().trim()))).filter(Boolean);

  const results = await Promise.all(
    unique.map((kw) => fetchKeywordOverview(kw, database, apiKey))
  );

  for (const r of results) {
    if (r) out.set(r.keyword.toLowerCase().trim(), r);
  }
  return out;
}

/**
 * Format a KeywordMetrics row for inclusion in an LLM prompt.
 */
export function formatMetricsForPrompt(m: KeywordMetrics): string {
  const parts = [
    `${m.volume.toLocaleString()} searches/mo`,
    m.difficulty !== null ? `KD ${m.difficulty.toFixed(0)}` : "KD n/a",
    `CPC $${m.cpc.toFixed(2)}`,
  ];
  return `"${m.keyword}" — ${parts.join(", ")}`;
}
