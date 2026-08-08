/**
 * Context.dev client — raw fetch, no SDK. This is the sponsor integration that
 * has to be load-bearing twice: the onboarding crawl (/web/crawl) and the
 * mid-call live lookup (/web/scrape/markdown, routed by /web/scrape/sitemap).
 *
 * Key read lazily per call, same reasoning as lib/supabase.ts: env vars don't
 * exist at build time, and a missing key should fail the request that needed
 * it, not the deploy.
 */

const API = "https://api.context.dev/v1";

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
 * Crawl the domain into LLM-ready markdown, one entry per page.
 *
 * This is the onboarding step the product claim rests on: it replaces a week of
 * someone hand-building a knowledge base, and it reads the JavaScript-rendered
 * sites a plain fetch returns nothing useful for — most of the SME market.
 */
export async function crawlSite(
  url: string,
  { maxPages, maxDepth }: { maxPages: number; maxDepth: number },
  signal?: AbortSignal,
): Promise<CrawledPage[]> {
  const response = await fetch(`${API}/web/crawl`, {
    method: "POST",
    signal,
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      url,
      maxPages,
      maxDepth,
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

/** One page → clean markdown. The live tier's read; cheaper than a crawl. */
export async function scrapeMarkdown(url: string, signal?: AbortSignal): Promise<string> {
  const query = new URLSearchParams({
    url,
    useMainContentOnly: "true",
    includeImages: "false",
    // The live tier is answering "is this still true right now" — a day-old
    // cached scrape would defeat the entire point of the endpoint.
    maxAgeMs: "0",
  });

  const response = await fetch(`${API}/web/scrape/markdown?${query}`, {
    headers: { authorization: `Bearer ${apiKey()}` },
    signal,
  });

  if (!response.ok) {
    throw new Error(`context.dev scrape failed for ${url}: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { markdown?: unknown };
  if (typeof body.markdown !== "string") throw new Error("context.dev scrape returned no markdown");
  return body.markdown;
}

/** URLs under a domain, from its sitemap. Routes a live lookup to one page. */
export async function sitemapUrls(
  url: string,
  maxLinks: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const query = new URLSearchParams({ url, maxLinks: String(maxLinks) });

  const response = await fetch(`${API}/web/scrape/sitemap?${query}`, {
    headers: { authorization: `Bearer ${apiKey()}` },
    signal,
  });

  if (!response.ok) {
    throw new Error(`context.dev sitemap failed for ${url}: ${response.status}`);
  }

  const body = (await response.json()) as { urls?: unknown };
  return Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string") : [];
}
