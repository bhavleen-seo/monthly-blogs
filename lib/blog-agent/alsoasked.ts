/**
 * AlsoAsked API client — fetches "People Also Asked" questions for given seed
 * terms. Used by the researcher to ground topic suggestions in real search intent.
 *
 * Set ALSOASKED_API_KEY in environment to enable. If unset or the API fails,
 * callers receive an empty array and research falls back to Claude's own ideas.
 *
 * API reference: https://alsoaskedapi.com/docs
 * Endpoint: POST https://alsoaskedapi.com/v1/search
 * Auth: X-Api-Key header
 */

interface QuestionNode {
  question?: string;
  results?: QuestionNode[];
}

interface SearchResponse {
  queries?: Array<{ results?: QuestionNode[] }>;
  results?: QuestionNode[];
}

const API_URL = "https://alsoaskedapi.com/v1/search";

function flattenQuestions(nodes: QuestionNode[] | undefined, out: string[] = []): string[] {
  if (!nodes) return out;
  for (const n of nodes) {
    if (n.question) out.push(n.question);
    if (n.results?.length) flattenQuestions(n.results, out);
  }
  return out;
}

/**
 * Fetch related questions for an array of seed terms. Returns a de-duplicated
 * list, capped to `limit` to keep the prompt size reasonable.
 */
export async function getRelatedQuestions(
  terms: string[],
  options: { region?: string; language?: string; limit?: number } = {}
): Promise<string[]> {
  const apiKey = process.env.ALSOASKED_API_KEY;
  if (!apiKey || terms.length === 0) return [];

  const { region = "au", language = "en", limit = 25 } = options;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terms: terms.slice(0, 3), // cap to 3 seed terms per call
        language,
        region,
        depth: 2,
        fresh: false,
        async: false,
      }),
    });

    if (!res.ok) {
      console.error(
        `[alsoasked] API error ${res.status}:`,
        (await res.text()).slice(0, 200)
      );
      return [];
    }

    const data: SearchResponse = await res.json();

    // Response shape varies; collect questions from both possible locations
    const questions: string[] = [];
    if (data.queries) {
      for (const q of data.queries) {
        flattenQuestions(q.results, questions);
      }
    }
    if (data.results) {
      flattenQuestions(data.results, questions);
    }

    // De-duplicate and cap
    const unique = Array.from(new Set(questions.map((q) => q.trim()))).filter(Boolean);
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[alsoasked] request failed:", err);
    return [];
  }
}
