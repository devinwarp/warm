import { NextResponse } from "next/server";

/**
 * POST /api/lookup  { question, source_url }  ->  { answer, source_url, fetched_at }
 *
 * The `lookup_live` server tool. ElevenLabs calls this mid-conversation when the
 * cached Fact Sheet doesn't cover the question, or when the question is
 * time-sensitive. This endpoint is the live tier — it is the difference between
 * this build and the example idea in the brief.
 *
 * Owner: Person 2 (Data). Wiring into the agent: Person 1 (Voice).
 */

// ponytail: hard ceiling, not a tuned number. Past this the agent falls back to
// the cached sheet and says so — a slow answer on stage is worse than a stale one.
const TIMEOUT_MS = 6000;

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
    // TODO(Person 2): live Context.dev query scoped to source_url's domain.
    const answer = await lookupLive(body.question, body.source_url, signal);

    return NextResponse.json({
      answer,
      source_url: body.source_url,
      fetched_at: new Date().toISOString(),
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

async function lookupLive(_question: string, _sourceUrl: string, _signal: AbortSignal): Promise<string> {
  throw new Error("not implemented — Person 2, T+120");
}
