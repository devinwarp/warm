import { z } from "zod";

/**
 * The demo phone line.
 *
 * There is no Twilio here. The Concierge's `book_table` posts the booking to
 * /api/ring instead of dialling, and the phone at /phone picks it up, rings,
 * and hands the human the Booker agent over WebRTC. The restaurant is whoever
 * is holding that page.
 *
 * Nothing reaches the PSTN on this path, which is why there is no number
 * allowlist — the one in lib/booking.ts exists because that path really dials.
 *
 * ponytail: one module-level call, because a phone has one line. Two server
 * instances would each keep their own, so move this to Supabase the day the
 * demo runs behind more than one.
 */

const RingSchema = z.object({
  restaurant_name: z.string().trim().min(1).max(120),
  // Coerced: these arrive from a language model, which says "4" as often as 4.
  party_size: z.coerce.number().int().min(1).max(20),
  when: z.string().trim().min(1).max(120),
  customer_name: z.string().trim().min(1).max(80),
  customer_phone: z.string().trim().min(1).max(32),
});

const TurnSchema = z.object({ role: z.string().max(16), message: z.string().max(4000) });

const PatchSchema = z.object({
  id: z.string().min(1),
  state: z.enum(["ringing", "live", "done", "failed"]).optional(),
  transcript: z.array(TurnSchema).max(400).optional(),
});

export type RingRequest = z.infer<typeof RingSchema>;
export type Patch = z.infer<typeof PatchSchema>;
export type Turn = z.infer<typeof TurnSchema>;

/** `failed` covers both hung up on and never answered — the card reads the same. */
export type CallState = "ringing" | "live" | "done" | "failed";

export type Call = RingRequest & {
  id: string;
  state: CallState;
  transcript: Turn[];
  rang_at: string;
};

let call: Call | null = null;

/** Reads like a sentence on screen; zod's raw issue JSON does not. */
function parse<T>(schema: z.ZodType<T>, input: unknown, what: string): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new Error(issue ? `${issue.path.join(".") || what}: ${issue.message}` : `invalid ${what}`);
}

export function parseRing(input: unknown): RingRequest {
  return parse(RingSchema, input, "booking");
}

export function parsePatch(input: unknown): Patch {
  return parse(PatchSchema, input, "update");
}

/** Ring the phone. A new call replaces whatever was on the line. */
export function ring(request: RingRequest): Call {
  call = {
    ...request,
    id: crypto.randomUUID(),
    state: "ringing",
    transcript: [],
    rang_at: new Date().toISOString(),
  };
  return call;
}

export function current(): Call | null {
  return call;
}

/** Null when the id is stale — a later call already took the line. */
export function update(patch: Patch): Call | null {
  if (!call || call.id !== patch.id) return null;
  call = {
    ...call,
    state: patch.state ?? call.state,
    transcript: patch.transcript ?? call.transcript,
  };
  return call;
}

/** Test seam. Module state outlives a test file otherwise. */
export function hangUpEverything(): void {
  call = null;
}
