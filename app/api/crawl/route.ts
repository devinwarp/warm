import { NextResponse } from "next/server";
import { crawlAndExtract } from "@/lib/crawl";
import { cacheFactSheet, getCachedFactSheet } from "@/lib/supabase";

/**
 * POST /api/crawl  { url, maxPages?, maxDepth? }  ->  FactSheet
 *
 * Owner: Person 2 (Data).
 * maxPages/maxDepth are an operator knob for the crawl level; both optional,
 * clamped in lib/crawl.ts, env-defaulted (CRAWL_MAX_PAGES / CRAWL_MAX_DEPTH).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
    maxPages?: unknown;
    maxDepth?: unknown;
  } | null;

  if (typeof body?.url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Trust boundary: an operator pastes this. stdlib URL is the whole validation.
  let url: string;
  try {
    url = new URL(body.url).toString();
  } catch {
    return NextResponse.json({ error: "url is not a valid URL" }, { status: 400 });
  }

  const cached = await getCachedFactSheet(url);
  if (cached) return NextResponse.json(cached);

  let sheet;
  try {
    sheet = await crawlAndExtract(url, {
      maxPages: typeof body.maxPages === "number" ? body.maxPages : undefined,
      maxDepth: typeof body.maxDepth === "number" ? body.maxDepth : undefined,
    });
  } catch (error) {
    // The operator pasted the URL and is watching — say what broke.
    const message = error instanceof Error ? error.message : "extraction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await cacheFactSheet(url, sheet);
  return NextResponse.json(sheet);
}
