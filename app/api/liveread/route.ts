import { NextResponse } from "next/server";
import { readLive } from "@/lib/liveread";

/**
 * POST /api/liveread  { name, google_url }  ->  LiveRead
 *
 * The reputation half of the live tier. /api/lookup re-reads a business's own
 * site mid-call; this re-reads their Google listing for the rating and the
 * open/closed line, which no website publishes about itself.
 */

// A scrape plus one model pass. Well under the crawl's budget, but past the
// platform default.
export const maxDuration = 45;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    google_url?: unknown;
  } | null;

  if (typeof body?.name !== "string" || typeof body?.google_url !== "string") {
    return NextResponse.json({ error: "name and google_url are required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await readLive(body.name, body.google_url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "the live read failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
