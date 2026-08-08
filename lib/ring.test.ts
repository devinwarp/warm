import { beforeEach, describe, expect, it } from "vitest";
import { current, hangUpEverything, parsePatch, parseRing, ring, update } from "./ring";

const BOOKING = {
  restaurant_name: "Ceylon Table",
  party_size: 4,
  when: "tonight at 8",
  customer_name: "Maya",
  customer_phone: "+971501234567",
};

beforeEach(hangUpEverything);

describe("parseRing", () => {
  it("takes a party size the model said out loud as a string", () => {
    expect(parseRing({ ...BOOKING, party_size: "4" }).party_size).toBe(4);
  });

  it("rejects a booking with no restaurant, in a sentence", () => {
    expect(() => parseRing({ ...BOOKING, restaurant_name: " " })).toThrow(/restaurant_name/);
  });

  it("rejects a party of nobody and a party of a hundred", () => {
    expect(() => parseRing({ ...BOOKING, party_size: 0 })).toThrow();
    expect(() => parseRing({ ...BOOKING, party_size: 100 })).toThrow();
  });
});

// No Supabase env in a test run, so these exercise the in-memory line. The
// Supabase path is the same three calls against a table.
describe("the line", () => {
  it("is silent until something rings it", async () => {
    expect(await current()).toBeNull();
  });

  it("rings, gets answered, collects the transcript, and hangs up", async () => {
    const call = await ring(parseRing(BOOKING));
    expect(call.state).toBe("ringing");
    expect((await current())?.id).toBe(call.id);

    await update({ id: call.id, state: "live" });
    await update({
      id: call.id,
      state: "live",
      transcript: [{ role: "agent", message: "table for four?" }],
    });
    expect((await current())?.transcript).toHaveLength(1);

    // A hang-up with no transcript must not wipe what was said.
    expect((await update({ id: call.id, state: "done" }))?.transcript).toHaveLength(1);
    expect((await current())?.state).toBe("done");
  });

  it("ignores an update from a call that already lost the line", async () => {
    const first = await ring(parseRing(BOOKING));
    const second = await ring(parseRing(BOOKING));

    expect(await update({ id: first.id, state: "done" })).toBeNull();
    expect((await current())?.id).toBe(second.id);
    expect((await current())?.state).toBe("ringing");
  });

  it("only accepts states the phone can actually be in", () => {
    expect(() => parsePatch({ id: "x", state: "on-hold" })).toThrow();
    expect(parsePatch({ id: "x", state: "failed" }).state).toBe("failed");
  });
});
