import { z } from "zod";
import { getCall, haveSupabase, putCall } from "./supabase";

/**
 * The demo phone line. Every call goes here — there is no Twilio.
 *
 * The Concierge's `book_table` posts the booking to /api/ring, and the phone
 * at /phone picks it up, rings, and hands the human the Booker agent over
 * WebRTC. The restaurant is whoever is holding that page. Nothing on this path
 * reaches the PSTN, so there is no number to allowlist.
 *
 * One call at a time, because a phone has one line. It lives in Supabase when
 * that is configured: the ring and the answer are separate requests, and on
 * Vercel they are not guaranteed to hit the same server instance. In memory
 * they would sometimes be two different phones, one of which never rings.
 *
 * ponytail: read-modify-write with no locking. One phone, one caller — if two
 * ever answer at once, the last write wins and that is fine for a demo.
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

/** Only used when Supabase isn't configured — a bare local checkout. */
let memory: Call | null = null;

const CallSchema: z.ZodType<Call> = RingSchema.extend({
  id: z.string(),
  state: z.enum(["ringing", "live", "done", "failed"]),
  transcript: z.array(TurnSchema),
  rang_at: z.string(),
});

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

async function write(call: Call): Promise<Call> {
  if (haveSupabase()) await putCall(call);
  else memory = call;
  return call;
}

/** Ring the phone. A new call replaces whatever was on the line. */
export async function ring(request: RingRequest): Promise<Call> {
  return write({
    ...request,
    id: crypto.randomUUID(),
    state: "ringing",
    transcript: [],
    rang_at: new Date().toISOString(),
  });
}

export async function current(): Promise<Call | null> {
  if (!haveSupabase()) return memory;
  // Validated on read: a row written before a shape change must read as an
  // empty line, not crash the poll that the ringing depends on.
  const parsed = CallSchema.safeParse(await getCall());
  return parsed.success ? parsed.data : null;
}

/** Null when the id is stale — a later call already took the line. */
export async function update(patch: Patch): Promise<Call | null> {
  const call = await current();
  if (!call || call.id !== patch.id) return null;
  return write({
    ...call,
    state: patch.state ?? call.state,
    transcript: patch.transcript ?? call.transcript,
  });
}

/** Test seam. Module state outlives a test file otherwise. */
export function hangUpEverything(): void {
  memory = null;
}
