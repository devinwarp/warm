import { NextResponse } from "next/server";
import { current, parsePatch, parseRing, ring, update } from "@/lib/ring";

/**
 * The phone line at /phone.
 *
 * POST   { restaurant_name, party_size, when, customer_name, customer_phone }
 *        -> { call_id }            the webhook: makes the phone ring
 * GET                              -> { call }               the phone, waiting
 * GET    ?id=<call_id>             -> { status, transcript }  the caller's card
 * PATCH  { id, state?, transcript? } -> { call }   answered, spoken, hung up
 */

export async function POST(request: Request) {
  try {
    const call = ring(parseRing(await request.json().catch(() => null)));
    return NextResponse.json({ call_id: call.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid booking" },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const call = current();
  if (!id) return NextResponse.json({ call });

  // A caller polling an id that no longer holds the line has lost it — say so
  // rather than leaving their card ringing forever.
  const mine = call && call.id === id ? call : null;
  return NextResponse.json({
    status: mine?.state ?? "failed",
    transcript: mine?.transcript ?? [],
  });
}

export async function PATCH(request: Request) {
  try {
    const call = update(parsePatch(await request.json().catch(() => null)));
    return NextResponse.json({ call });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid update" },
      { status: 400 },
    );
  }
}
