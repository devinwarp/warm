import { scrapeMarkdown, sitemapUrls } from "@/lib/contextdev";
import { complete } from "@/lib/llm";

/**
 * The live tier. Route the question to the page most likely to hold the
 * answer, re-read that one page through Context.dev, and answer from it —
 * nothing else. The whole thing runs under the caller's 6s abort signal.
 */

// The sitemap step is optional routing sugar — it must never eat the budget
// that the scrape and the model call need.
const SITEMAP_BUDGET_MS = 1500;
const SITEMAP_MAX_LINKS = 100;

export const NOT_FOUND = "NOT_FOUND";

const ANSWER_PROMPT = `You answer one caller question using ONLY the page content provided.

Rules:
- Answer in one or two short spoken sentences, quoting the page's own wording
  for prices, times, and addresses.
- If the page content does not contain the answer, reply with exactly
  NOT_FOUND and nothing else. Never estimate, never say what is typical.`;

// ponytail: keyword routing, not retrieval. Four intents cover the demo's
// question set; the upgrade path is embedding the sitemap once at crawl time.
const ROUTES: { pattern: RegExp; page: RegExp }[] = [
  { pattern: /price|cost|how much|fee|rate|charge/i, page: /pricing|price|services|menu|rate/i },
  { pattern: /open|close|hours|tonight|today|when/i, page: /hours|contact|about|visit/i },
  { pattern: /where|address|located|location|branch|direction/i, page: /contact|location|visit|find/i },
  { pattern: /book|appointment|reserve|walk-?in/i, page: /book|appointment|contact|services/i },
];

/** Best page URL for the question, or null to just use the source URL. */
export function routeQuestion(question: string, urls: string[]): string | null {
  const route = ROUTES.find((r) => r.pattern.test(question));
  return route ? (urls.find((u) => route.page.test(new URL(u).pathname)) ?? null) : null;
}

export async function lookupLive(
  question: string,
  sourceUrl: string,
  signal: AbortSignal,
): Promise<string> {
  let pageUrl = sourceUrl;
  try {
    const urls = await sitemapUrls(
      sourceUrl,
      SITEMAP_MAX_LINKS,
      AbortSignal.any([signal, AbortSignal.timeout(SITEMAP_BUDGET_MS)]),
    );
    pageUrl = routeQuestion(question, urls) ?? sourceUrl;
  } catch {
    // Routing is best-effort; the homepage is always an acceptable fallback.
  }

  const markdown = await scrapeMarkdown(pageUrl, signal);

  const answer = (
    await complete(ANSWER_PROMPT, `Question: ${question}\n\nPage (${pageUrl}):\n\n${markdown}`, {
      signal,
    })
  ).trim();

  // A NOT_FOUND must surface as a throw so the API route's catch returns
  // answer: null and the agent falls back to the cached sheet (ADR-0003).
  if (answer === NOT_FOUND || answer.length === 0) {
    throw new Error("live lookup found no answer on the page");
  }
  return answer;
}
