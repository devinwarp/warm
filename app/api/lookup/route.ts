import { NextResponse } from "next/server";
import { lookupLive } from "@/lib/lookup";

/**
 * POST /api/lookup  { question, source_url }  ->  { answer, source_url, fetched_at }
 *
 * The `lookup_live` server tool. ElevenLabs calls this mid-conversation when the
 * cached Fact Sheet doesn't cover the question, or when the question is
 * time-sensitive. This endpoint is the live tier — it is the difference between
 * this build and the example idea in the brief.
 *
 * Owner: Lijeesh (Data). Wiring into the agent: Taha (Voice).
 */

// ponytail: hard ceiling, not a tuned number. Past this the agent falls back to
// the cached sheet and says so — a slow answer on stage is worse than a stale one.
const TIMEOUT_MS = 6000;

// ponytail: module-level, so the page's "last read" stamp only sees lookups
// that landed on this instance. Fine for one demo conversation; the upgrade
// path is a timestamp column next to the fact sheet in Supabase.
let lastFetchedAt: string | null = null;

/** GET /api/lookup -> { fetched_at } — the page polls this for the stamp. */
export async function GET() {
  return NextResponse.json({ fetched_at: lastFetchedAt });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    question?: unknown;
    source_url?: unknown;
  } | null;

  if (typeof body?.question !== "string" || typeof body?.source_url !== "string") {
    return NextResponse.json({ error: "question and source_url are required" }, { status: 400 });
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);

  try {
    const answer = await lookupLive(body.question, body.source_url, signal);

    lastFetchedAt = new Date().toISOString();
    return NextResponse.json({
      answer,
      source_url: body.source_url,
      fetched_at: lastFetchedAt,
    });
  } catch {
    // The agent must always get a usable turn back. Never a dead line.
    return NextResponse.json({
      answer: null,
      source_url: body.source_url,
      fetched_at: null,
    });
  }
}

