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

describe("the line", () => {
  it("is silent until something rings it", () => {
    expect(current()).toBeNull();
  });

  it("rings, gets answered, collects the transcript, and hangs up", () => {
    const call = ring(parseRing(BOOKING));
    expect(call.state).toBe("ringing");
    expect(current()?.id).toBe(call.id);

    update({ id: call.id, state: "live" });
    update({
      id: call.id,
      state: "live",
      transcript: [{ role: "agent", message: "table for four?" }],
    });
    expect(current()?.transcript).toHaveLength(1);

    // A hang-up with no transcript must not wipe what was said.
    expect(update({ id: call.id, state: "done" })?.transcript).toHaveLength(1);
    expect(current()?.state).toBe("done");
  });

  it("ignores an update from a call that already lost the line", () => {
    const first = ring(parseRing(BOOKING));
    const second = ring(parseRing(BOOKING));

    expect(update({ id: first.id, state: "done" })).toBeNull();
    expect(current()?.id).toBe(second.id);
    expect(current()?.state).toBe("ringing");
  });

  it("only accepts states the phone can actually be in", () => {
    expect(() => parsePatch({ id: "x", state: "on-hold" })).toThrow();
    expect(parsePatch({ id: "x", state: "failed" }).state).toBe("failed");
  });
});
