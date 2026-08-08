import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/places";

/**
 * POST /api/places  { query, area?, limit? }  ->  { places: Place[] }
 *
 * Serves both canvas flows: "find this business" and "find restaurants like
 * this near here". One actor, one latency profile to tune.
 */

// The Google Maps actor routinely runs 20-90s. Vercel's default would kill it.
export const maxDuration = 120;

const MAX_LIMIT = 10;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
    area?: unknown;
    limit?: unknown;
  } | null;

  if (typeof body?.query !== "string" || body.query.trim() === "") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const limit =
    typeof body.limit === "number" ? Math.min(Math.max(1, Math.trunc(body.limit)), MAX_LIMIT) : undefined;

  try {
    const places = await searchPlaces(body.query, {
      area: typeof body.area === "string" ? body.area : undefined,
      limit,
    });
    return NextResponse.json({ places });
  } catch (error) {
    const message = error instanceof Error ? error.message : "places search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
