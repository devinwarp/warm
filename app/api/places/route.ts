import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/places";
import { cachePlaces, getCachedPlaces, placesKey } from "@/lib/supabase";

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

  const area = typeof body.area === "string" ? body.area : undefined;
  const key = placesKey(body.query, area);

  // A cache hit is the demo path. A miss must still work, and must still be
  // narrated by the agent — a cold actor run is 20-90s.
  const cached = await getCachedPlaces(key).catch(() => null);
  if (cached) return NextResponse.json({ places: cached });

  try {
    const places = await searchPlaces(body.query, { area, limit });

    // A cache write failure must not take down a search that succeeded.
    await cachePlaces(key, places).catch((error: unknown) => {
      console.warn(`places cache write skipped: ${error instanceof Error ? error.message : error}`);
    });
    return NextResponse.json({ places });
  } catch (error) {
    const message = error instanceof Error ? error.message : "places search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
