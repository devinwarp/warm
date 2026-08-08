/**
 * Context.dev client — raw fetch, no SDK. Three calls, all bearer-auth GET/POST
 * against https://api.context.dev/v1. This is the sponsor integration that has
 * to be load-bearing twice: the onboarding crawl and the mid-call live lookup.
 *
 * Key read lazily per request, same reasoning as lib/supabase.ts: env vars
 * don't exist at build time, and a missing key should fail the request that
 * needed it, not the deploy.
 */

const BASE = "https://api.context.dev/v1";

export type CrawledPage = { url: string; markdown: string };

function authHeader(): Record<string, string> {
  const key = process.env.CONTEXT_API_KEY;
  if (!key) throw new Error("CONTEXT_API_KEY is not set");
  return { authorization: `Bearer ${key}` };
}

/** One page → clean markdown, nav and footer stripped. */
export async function scrapeMarkdown(url: string, signal?: AbortSignal): Promise<string> {
  const qs = new URLSearchParams({ url, useMainContentOnly: "true", includeLinks: "false" });
  const res = await fetch(`${BASE}/web/scrape/markdown?${qs}`, { headers: authHeader(), signal });
  if (!res.ok) throw new Error(`context.dev scrape ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as { markdown?: unknown };
  if (typeof body.markdown !== "string") throw new Error("context.dev scrape returned no markdown");
  return body.markdown;
}

/** Crawl from a seed URL. maxDepth 0 = just the seed page. */
export async function crawlSite(
  url: string,
  { maxPages, maxDepth }: { maxPages: number; maxDepth: number },
  signal?: AbortSignal,
): Promise<CrawledPage[]> {
  const res = await fetch(`${BASE}/web/crawl`, {
    method: "POST",
    headers: { ...authHeader(), "content-type": "application/json" },
    body: JSON.stringify({ url, maxPages, maxDepth, useMainContentOnly: true, includeLinks: false }),
    signal,
  });
  if (!res.ok) throw new Error(`context.dev crawl ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as {
    results?: { markdown?: unknown; metadata?: { url?: unknown; success?: unknown } }[];
  };
  if (!Array.isArray(body.results)) throw new Error("context.dev crawl returned no results");

  const pages = body.results.flatMap((r) =>
    typeof r.markdown === "string" &&
    r.markdown.length > 0 &&
    typeof r.metadata?.url === "string" &&
    r.metadata.success !== false
      ? [{ url: r.metadata.url, markdown: r.markdown }]
      : [],
  );
  if (pages.length === 0) throw new Error("context.dev crawl returned no usable pages");
  return pages;
}

/** URLs under a domain, from its sitemap. Used to route live lookups. */
export async function sitemapUrls(
  url: string,
  maxLinks: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const qs = new URLSearchParams({ url, maxLinks: String(maxLinks) });
  const res = await fetch(`${BASE}/web/scrape/sitemap?${qs}`, { headers: authHeader(), signal });
  if (!res.ok) throw new Error(`context.dev sitemap ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as { urls?: unknown };
  return Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string") : [];
}
