import { createClient } from "@supabase/supabase-js";
import { type FactSheet, FactSheetSchema } from "./factsheet";
import type { Place } from "./places";

// ponytail: service-role client, server-only. There is no auth and no RLS —
// one table, no user data. If this ever goes multi-tenant, that changes first.
//
// Built on first use, not at module scope: env vars don't exist at build time,
// and a missing key should fail the request that needed it, not the deploy.
type Row = { url: string; data: FactSheet; crawled_at: string };
type PlacesRow = { key: string; data: Place[]; fetched_at: string };
type DemoStatusRow = { slug: string; preset: string; updated_at: string };
type CallsRow = { line: string; data: unknown; rang_at: string };

/** Mirrors supabase/migrations/0001_factsheets.sql. One table, hand-written. */
type Database = {
  public: {
    Tables: {
      factsheets: {
        Row: Row;
        Insert: Omit<Row, "crawled_at"> & { crawled_at?: string };
        Update: Partial<Row>;
        Relationships: [];
      };
      places: {
        Row: PlacesRow;
        Insert: Omit<PlacesRow, "fetched_at"> & { fetched_at?: string };
        Update: Partial<PlacesRow>;
        Relationships: [];
      };
      demo_status: {
        Row: DemoStatusRow;
        Insert: Omit<DemoStatusRow, "updated_at"> & { updated_at?: string };
        Update: Partial<DemoStatusRow>;
        Relationships: [];
      };
      calls: {
        Row: CallsRow;
        Insert: Omit<CallsRow, "rang_at"> & { rang_at?: string };
        Update: Partial<CallsRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

let client: ReturnType<typeof createClient<Database>> | null = null;

function db() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  client = createClient<Database>(url, key, { auth: { persistSession: false } });
  return client;
}

/** Cached sheet for a URL, or null. Never throws — a cache miss is not an error. */
export async function getCachedFactSheet(url: string): Promise<FactSheet | null> {
  const { data } = await db().from("factsheets").select("data").eq("url", url).maybeSingle();
  if (!data) return null;

  // Validate on read: a sheet cached before a schema change must miss, not crash a call.
  const parsed = FactSheetSchema.safeParse(data.data);
  return parsed.success ? parsed.data : null;
}

export async function cacheFactSheet(url: string, sheet: FactSheet): Promise<void> {
  const { error } = await db()
    .from("factsheets")
    .upsert({ url, data: sheet, crawled_at: sheet.crawled_at });
  if (error) throw new Error(`cache write failed: ${error.message}`);
}

/** Cache key for a place search. Case- and whitespace-insensitive. */
export function placesKey(query: string, area?: string): string {
  return `${query.trim()}|${area?.trim() ?? ""}`.toLowerCase().replace(/\s+/g, " ");
}

/** Cached places for a search, or null. Never throws — a miss is not an error. */
export async function getCachedPlaces(key: string): Promise<Place[] | null> {
  const { data } = await db().from("places").select("data").eq("key", key).maybeSingle();
  return Array.isArray(data?.data) && data.data.length > 0 ? data.data : null;
}

export async function cachePlaces(key: string, places: Place[]): Promise<void> {
  const { error } = await db().from("places").upsert({ key, data: places });
  if (error) throw new Error(`places cache write failed: ${error.message}`);
}

/** True when Supabase is wired up at all — see the fallback in lib/ring.ts. */
export function haveSupabase(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * The phone line (supabase/migrations/0004_calls.sql). One row, one call.
 *
 * The read never throws — a phone that 500s mid-poll stops ringing, and a
 * missed poll is meant to be survivable. The write does throw, loudly: if the
 * line can't be written, no call is coming and you want to know at the first
 * booking, not during the demo.
 */
export async function getCall(): Promise<unknown | null> {
  try {
    const { data } = await db().from("calls").select("data").eq("line", "demo").maybeSingle();
    return data?.data ?? null;
  } catch {
    return null;
  }
}

export async function putCall(call: unknown): Promise<void> {
  const { error } = await db()
    .from("calls")
    .upsert({ line: "demo", data: call, rang_at: new Date().toISOString() });
  if (error) throw new Error(`the line is unreachable: ${error.message}`);
}

/**
 * Which preset a demo site is currently showing, or null if never flipped.
 * Never throws: a demo page that can't reach Supabase must still render its
 * fallback rather than 500 in front of the room.
 */
export async function getDemoPreset(slug: string): Promise<string | null> {
  try {
    const { data } = await db().from("demo_status").select("preset").eq("slug", slug).maybeSingle();
    return data?.preset ?? null;
  } catch {
    return null;
  }
}

export async function setDemoPreset(slug: string, preset: string): Promise<void> {
  const { error } = await db()
    .from("demo_status")
    .upsert({ slug, preset, updated_at: new Date().toISOString() });
  if (error) throw new Error(`demo status write failed: ${error.message}`);
}
