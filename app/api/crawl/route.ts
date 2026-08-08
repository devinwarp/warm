import { NextResponse } from "next/server";
import { crawlAndExtract } from "@/lib/crawl";
import { cacheFactSheet, getCachedFactSheet } from "@/lib/supabase";

/**
 * POST /api/crawl  { url }  ->  FactSheet
 *
 * Owner: Lijeesh (Data).
 * Frontend and Voice build against this shape from T+20.
 */

// A multi-page Context.dev crawl plus the extraction pass runs tens of seconds.
// Vercel's default function timeout is far shorter and would kill it mid-crawl.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;

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
    sheet = await crawlAndExtract(url);
  } catch (error) {
    // The operator pasted the URL and is watching — say what broke.
    const message = error instanceof Error ? error.message : "extraction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await cacheFactSheet(url, sheet);
  return NextResponse.json(sheet);
}
