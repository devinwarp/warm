import { createClient } from "@supabase/supabase-js";
import { type FactSheet, FactSheetSchema } from "./factsheet";

// ponytail: service-role client, server-only. There is no auth and no RLS —
// one table, no user data. If this ever goes multi-tenant, that changes first.
//
// Built on first use, not at module scope: env vars don't exist at build time,
// and a missing key should fail the request that needed it, not the deploy.
type Row = { url: string; data: FactSheet; crawled_at: string };

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
