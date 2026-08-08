import { NextResponse } from "next/server";
import { FactSheetSchema } from "@/lib/factsheet";
import { cacheFactSheet, getCachedFactSheet } from "@/lib/supabase";

/**
 * POST /api/crawl  { url }  ->  FactSheet
 *
 * Owner: Person 2 (Data).
 * Frontend and Voice build against this shape from T+20 — the body below is
 * the only part still missing.
 */
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

  // TODO(Person 2): Context.dev crawl -> Claude Sonnet 5 extraction pass.
  // Must return an object that survives FactSheetSchema.parse(), with every
  // unpublished field null — no inference. See §8 of the PRD.
  const sheet = FactSheetSchema.parse(await crawlAndExtract(url));

  await cacheFactSheet(url, sheet);
  return NextResponse.json(sheet);
}

async function crawlAndExtract(_url: string): Promise<unknown> {
  throw new Error("not implemented — Person 2, T+40");
}
