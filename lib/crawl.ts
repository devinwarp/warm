import { FactSheetSchema, type FactSheet } from "@/lib/factsheet";
import { completeJson } from "@/lib/llm";

const API = "https://api.context.dev/v1";

// A small business site is a handful of pages, and services and prices usually
// live off the homepage. Past this we're paying to read a blog archive.
const MAX_PAGES = 8;
const MAX_DEPTH = 1;

// Crawling several pages takes tens of seconds — app/api/crawl/route.ts raises
// its maxDuration to match, because Vercel's default would cut us off first.
const CRAWL_TIMEOUT_MS = 60_000;

// Roughly 8k tokens across all pages. Enough for a salon or clinic site.
const MAX_CHARS = 30_000;

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

export type CrawledPage = { url: string; title: string; markdown: string };

function apiKey(): string {
  // Context.dev's own SDKs read CONTEXT_DEV_API_KEY first and fall back to
  // CONTEXT_API_KEY, so accept whichever name is already in someone's shell.
  // `||`, not `??`: copying .env.example leaves the first name defined-but-empty,
  // and `??` would return "" instead of falling through to the second.
  const key = process.env.CONTEXT_DEV_API_KEY || process.env.CONTEXT_API_KEY;
  if (!key) throw new Error("CONTEXT_DEV_API_KEY (or CONTEXT_API_KEY) is required");
  return key;
}

/**
 * Context.dev crawls the domain and hands back LLM-ready markdown per page.
 *
 * This is the onboarding step the whole product claim rests on: it replaces a
 * week of someone hand-building a knowledge base. It also handles the
 * JavaScript-rendered sites a plain fetch returns nothing useful for, which is
 * most of the SME market we're aiming at.
 */
export async function crawlSite(url: string): Promise<CrawledPage[]> {
  const response = await fetch(`${API}/web/crawl`, {
    method: "POST",
    signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url,
      maxPages: MAX_PAGES,
      maxDepth: MAX_DEPTH,
      // Drops nav, footers, sidebars and cookie banners server-side — the
      // "crawl returns junk" risk in PRD §16, handled by a flag.
      useMainContentOnly: true,
      includeImages: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`context.dev crawl failed for ${url}: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as {
    results?: { markdown?: string; metadata?: { url?: string; title?: string } }[];
  };

  return (body.results ?? [])
    .map((page) => ({
      url: page.metadata?.url ?? url,
      title: page.metadata?.title ?? "",
      markdown: page.markdown ?? "",
    }))
    .filter((page) => page.markdown.trim() !== "");
}

/**
 * One document for the extraction pass, each page labelled with where it came
 * from — so a price on /services isn't silently attributed to the homepage.
 */
export function pagesToDocument(pages: CrawledPage[], limit = MAX_CHARS): string {
  return pages
    .map((page) => `## ${page.title || page.url}\n<${page.url}>\n\n${page.markdown.trim()}`)
    .join("\n\n---\n\n")
    .slice(0, limit);
}

export async function crawlAndExtract(url: string): Promise<FactSheet> {
  const pages = await crawlSite(url);
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
