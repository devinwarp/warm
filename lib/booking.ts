import { z } from "zod";

/**
 * The outbound booking call.
 *
 * The allowlist in validateBooking is the most important thing in this file.
 * These arguments come from a language model parsing speech from whoever is
 * holding the microphone on a public URL. Without the allowlist this endpoint
 * is a robodialer. It is checked server-side, before any outbound request.
 *
 * No twilio package: the Twilio credentials live inside the ElevenLabs
 * phone-number import, so the whole outbound leg is one authenticated fetch.
 */

const API = "https://api.elevenlabs.io/v1";

/** E.164, ignoring the spaces and dashes people and models put in numbers. */
const E164 = /^\+[1-9]\d{7,14}$/;

const digits = (value: string) => value.replace(/[^\d+]/g, "");

const BookingSchema = z.object({
  restaurant_name: z.string().min(1),
  to_number: z.string().transform(digits).refine((v) => E164.test(v), "not a phone number"),
  party_size: z.number().int().min(1).max(20),
  when: z.string().min(1),
  customer_name: z.string().min(1),
  customer_phone: z.string().transform(digits).refine((v) => E164.test(v), "not a phone number"),
});

export type BookingRequest = z.infer<typeof BookingSchema>;

/** Approved demo numbers. Empty or unset means nothing may be dialled. */
function allowlist(): string[] {
  return (process.env.DEMO_BOOKING_NUMBERS ?? "")
    .split(",")
    .map((n) => digits(n.trim()))
    .filter((n) => n !== "");
}

export function validateBooking(input: unknown): BookingRequest {
  const booking = BookingSchema.parse(input);

  if (!allowlist().includes(booking.to_number)) {
    throw new Error(`${booking.to_number} is not an approved demo number`);
  }
  return booking;
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is required");
  return key;
}

export async function placeBookingCall(
  booking: BookingRequest,
  signal?: AbortSignal,
): Promise<{ conversationId: string; callSid: string | null }> {
  const agentId = process.env.ELEVENLABS_BOOKER_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
  if (!agentId || !phoneNumberId) {
    throw new Error("ELEVENLABS_BOOKER_AGENT_ID and ELEVENLABS_AGENT_PHONE_NUMBER_ID are required");
  }

  const response = await fetch(`${API}/convai/twilio/outbound-call`, {
    method: "POST",
    signal,
    headers: { "xi-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: booking.to_number,
      // Same injection path the Fact Sheet uses (docs/adr/0002): the Booker
      // knows the whole booking before the phone starts ringing.
      conversation_initiation_client_data: {
        dynamic_variables: {
          restaurant_name: booking.restaurant_name,
          party_size: String(booking.party_size),
          when: booking.when,
          customer_name: booking.customer_name,
          customer_phone: booking.customer_phone,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`outbound call failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { conversation_id?: unknown; callSid?: unknown };
  if (typeof body.conversation_id !== "string") {
    throw new Error("outbound call failed: no conversation id came back");
  }
  return {
    conversationId: body.conversation_id,
    callSid: typeof body.callSid === "string" ? body.callSid : null,
  };
}

export async function callStatus(
  conversationId: string,
): Promise<{ status: string; transcript: { role: string; message: string }[] }> {
  const response = await fetch(`${API}/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": apiKey() },
  });

  // A conversation is not readable the instant the call is placed. That is a
  // ringing phone, not an error — the poller keeps asking.
  if (!response.ok) return { status: "in-progress", transcript: [] };

  const body = (await response.json()) as { status?: unknown; transcript?: unknown };
  const turns = Array.isArray(body.transcript) ? body.transcript : [];

  return {
    status: typeof body.status === "string" ? body.status : "in-progress",
    transcript: turns
      .map((turn) => turn as { role?: unknown; message?: unknown })
      .filter(
        (turn): turn is { role: string; message: string } =>
          typeof turn.role === "string" && typeof turn.message === "string",
      )
      .map((turn) => ({ role: turn.role, message: turn.message })),
  };
}
