import { crawlSite, scrapeMarkdown, type CrawledPage } from "@/lib/contextdev";
import { FactSheetSchema, type FactSheet } from "@/lib/factsheet";
import { completeJson } from "@/lib/llm";

// Roughly 8k tokens of page content — past this it is repetition, not facts.
const MAX_CHARS = 30_000;

// A whole crawl has to fit inside the 60-second onboarding story, and
// Context.dev's own crawl budget defaults to 80s — cap ours well under it.
const CRAWL_TIMEOUT_MS = 45_000;

export type CrawlLevel = { maxPages: number; maxDepth: number };

/**
 * Crawl level is configurable per request (operator knob on /api/crawl) with
 * env defaults. maxPages 1 degenerates to a single-page scrape — the cheap
 * path and the old behaviour.
 */
export function crawlLevel(overrides?: Partial<CrawlLevel>): CrawlLevel {
  const fromEnv = (name: string, fallback: number) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(n)));

  return {
    maxPages: clamp(overrides?.maxPages ?? fromEnv("CRAWL_MAX_PAGES", 8), 1, 20),
    maxDepth: clamp(overrides?.maxDepth ?? fromEnv("CRAWL_MAX_DEPTH", 1), 0, 3),
  };
}

const EXTRACTION_PROMPT = `You extract a factual Fact Sheet from a business website's pages.

Return a JSON object with exactly these keys:
  business_name      string
  one_line           string  — one sentence describing the business
  services           array of { name: string, price: string|null, description: string }
  hours              string  — "" if the pages do not publish them
  locations          array of { branch: string, address: string, phone: string|null }
  booking_policy     string|null
  languages_spoken   array of strings
  escalation_note    string  — how to reach a human, taken from the pages

THE ONE RULE: copy what the pages say. Never infer, estimate, or fill in what
is typical for this kind of business. A price the pages do not print is null.
Hours the pages do not list are "". No languages listed is []. An empty field
is a correct answer — a plausible invented one is the only failure that matters.`;

// Pages whose path suggests facts come first when the total is capped.
const FACT_PAGE = /pricing|price|services|menu|contact|about|hours|location|book/i;

/** Concatenate crawled pages, fact-bearing paths first, capped at maxChars. */
export function pagesToText(pages: CrawledPage[], maxChars = MAX_CHARS): string {
  const ranked = [...pages].sort(
    (a, b) => Number(FACT_PAGE.test(b.url)) - Number(FACT_PAGE.test(a.url)),
  );

  let out = "";
  for (const page of ranked) {
    if (out.length >= maxChars) break;
    out += `## PAGE: ${page.url}\n\n${page.markdown}\n\n`;
  }
  return out.slice(0, maxChars);
}

export async function crawlAndExtract(url: string, level?: Partial<CrawlLevel>): Promise<FactSheet> {
  const { maxPages, maxDepth } = crawlLevel(level);
  const signal = AbortSignal.timeout(CRAWL_TIMEOUT_MS);

  const pages =
    maxPages === 1 || maxDepth === 0
      ? [{ url, markdown: await scrapeMarkdown(url, signal) }]
      : await crawlSite(url, { maxPages, maxDepth }, signal);

  const extracted = await completeJson(EXTRACTION_PROMPT, pagesToText(pages));

  // source_url and crawled_at are ours, not the model's — provenance the
  // agent reads out loud should never be something a model could hallucinate.
  return FactSheetSchema.parse({
    ...(extracted as object),
    source_url: url,
    crawled_at: new Date().toISOString(),
  });
}
