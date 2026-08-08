import { NextResponse } from "next/server";
import { callStatus, placeBookingCall, validateBooking } from "@/lib/booking";

/**
 * POST /api/book  { restaurant_name, to_number, party_size, when,
 *                   customer_name, customer_phone }  ->  { conversation_id }
 * GET  /api/book?id=<conversation_id>  ->  { status, transcript }
 *
 * validateBooking runs first and throws on anything not on the allowlist.
 * Nothing dials before it passes.
 */

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  let booking;
  try {
    booking = validateBooking(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid booking";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { conversationId } = await placeBookingCall(booking);
    return NextResponse.json({ conversation_id: conversationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "the call failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  return NextResponse.json(await callStatus(id));
}
