import { NextResponse } from "next/server";
import { geocode } from "@/lib/geocode";

/** POST /api/geocode  { query }  ->  { area: Area | null } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  if (typeof body?.query !== "string" || body.query.trim() === "") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  return NextResponse.json({ area: await geocode(body.query) });
}
