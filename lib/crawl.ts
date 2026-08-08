import { crawlSite, scrapeMarkdown, type CrawledPage } from "@/lib/contextdev";
import { FactSheetSchema, type FactSheet } from "@/lib/factsheet";
import { completeJson } from "@/lib/llm";

// Crawling several pages takes tens of seconds — app/api/crawl/route.ts raises
// its maxDuration to match, because Vercel's default would cut us off first.
const CRAWL_TIMEOUT_MS = 60_000;

// Roughly 8k tokens across all pages. Enough for a salon or clinic site.
const MAX_CHARS = 30_000;

export type CrawlLevel = { maxPages: number; maxDepth: number };

/**
 * How deep to crawl, in order of precedence: the request body, then env, then
 * the defaults. A small business site is a handful of pages and services and
 * prices usually live off the homepage — past 8 we're paying to read a blog
 * archive, so the knob exists but the default stays cheap.
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

const EXTRACTION_PROMPT = `You extract a factual Fact Sheet from a business website.

Return a JSON object with exactly these keys:
  business_name      string
  one_line           string  — one sentence describing the business
  services           array of { name: string, price: string|null, description: string }
  hours              string  — "" if the site does not publish them
  locations          array of { branch: string, address: string, phone: string|null }
  booking_policy     string|null
  languages_spoken   array of strings
  escalation_note    string  — how to reach a human, taken from the site

THE ONE RULE: copy what the site says. Never infer, estimate, or fill in what
is typical for this kind of business. A price the site does not print is null.
Hours the site does not list are "". No languages listed is []. An empty field
is a correct answer — a plausible invented one is the only failure that matters.`;

// When the character budget forces a choice, keep the pages that carry facts.
const FACT_PAGE = /pricing|price|services|menu|contact|about|hours|location|book/i;

/**
 * One document for the extraction pass, each page labelled with where it came
 * from — so a price on /services isn't silently attributed to the homepage.
 * Fact-bearing paths go first, because the tail is what the limit truncates.
 */
export function pagesToDocument(pages: CrawledPage[], limit = MAX_CHARS): string {
  const ranked = [...pages].sort(
    (a, b) => Number(FACT_PAGE.test(b.url)) - Number(FACT_PAGE.test(a.url)),
  );

  return ranked
    .map((page) => `## ${page.title || page.url}\n<${page.url}>\n\n${page.markdown.trim()}`)
    .join("\n\n---\n\n")
    .slice(0, limit);
}

export async function crawlAndExtract(url: string, level?: Partial<CrawlLevel>): Promise<FactSheet> {
  const { maxPages, maxDepth } = crawlLevel(level);
  const signal = AbortSignal.timeout(CRAWL_TIMEOUT_MS);

  // One page is a scrape, not a crawl — same markdown, a fraction of the cost.
  const pages =
    maxPages === 1 || maxDepth === 0
      ? [{ url, title: "", markdown: await scrapeMarkdown(url, signal) }]
      : await crawlSite(url, { maxPages, maxDepth }, signal);

  if (pages.length === 0) {
    throw new Error(`context.dev returned no readable pages for ${url}`);
  }

  const extracted = await completeJson(
    EXTRACTION_PROMPT,
    `Business website: ${url}\n\n${pagesToDocument(pages)}`,
  );

  // source_url and crawled_at are ours, not the model's — provenance the
  // agent reads out loud should never be something a model could hallucinate.
  return FactSheetSchema.parse({
    ...(extracted as object),
    source_url: url,
    crawled_at: new Date().toISOString(),
  });
}
