import { beforeEach, describe, expect, it, vi } from "vitest";
import { callStatus, placeBookingCall, validateBooking } from "./booking";

const good = {
  restaurant_name: "Qamar Table",
  to_number: "+97141234567",
  party_size: 4,
  when: "tomorrow at eight",
  customer_name: "Shameer",
  customer_phone: "+971501112233",
};

describe("validateBooking", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DEMO_BOOKING_NUMBERS", "+97141234567, +971509998877");
  });

  it("accepts a well-formed booking to an allowlisted number", () => {
    expect(validateBooking(good)).toEqual(good);
  });

  it("rejects a number that is not on the allowlist", () => {
    expect(() => validateBooking({ ...good, to_number: "+15551234567" })).toThrow(
      "not an approved demo number",
    );
  });

  it("rejects when the allowlist is unset, rather than allowing everything", () => {
    vi.stubEnv("DEMO_BOOKING_NUMBERS", "");
    expect(() => validateBooking(good)).toThrow("not an approved demo number");
  });

  it("ignores whitespace and formatting when matching the allowlist", () => {
    expect(validateBooking({ ...good, to_number: "+971 4 123 4567" }).to_number).toBe("+97141234567");
  });

  it("rejects a party size outside 1..20", () => {
    expect(() => validateBooking({ ...good, party_size: 0 })).toThrow();
    expect(() => validateBooking({ ...good, party_size: 21 })).toThrow();
  });

  it("rejects a customer phone that is not E.164", () => {
    expect(() => validateBooking({ ...good, customer_phone: "call me" })).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => validateBooking({ to_number: "+97141234567" })).toThrow();
  });
});

describe("placeBookingCall", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-test");
    vi.stubEnv("ELEVENLABS_BOOKER_AGENT_ID", "agent_booker");
    vi.stubEnv("ELEVENLABS_AGENT_PHONE_NUMBER_ID", "phnum_1");
    vi.restoreAllMocks();
  });

  it("sends the booking details as dynamic variables and returns the ids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, conversation_id: "conv_9", callSid: "CA1" }), {
        status: 200,
      }),
    );

    await expect(placeBookingCall(good)).resolves.toEqual({
      conversationId: "conv_9",
      callSid: "CA1",
    });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as [unknown, RequestInit | undefined];

    expect(String(url)).toContain("/v1/convai/twilio/outbound-call");
    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({
      agent_id: "agent_booker",
      agent_phone_number_id: "phnum_1",
      to_number: "+97141234567",
    });
    expect(
      (sent.conversation_initiation_client_data as { dynamic_variables: unknown }).dynamic_variables,
    ).toEqual({
      restaurant_name: "Qamar Table",
      party_size: "4",
      when: "tomorrow at eight",
      customer_name: "Shameer",
      customer_phone: "+971501112233",
    });
  });

  it("throws when ElevenLabs rejects the call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 422 }));
    await expect(placeBookingCall(good)).rejects.toThrow("outbound call failed");
  });
});

describe("callStatus", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-test");
    vi.restoreAllMocks();
  });

  it("flattens the conversation into status plus transcript turns", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "done",
          transcript: [
            { role: "agent", message: "Table for four at eight, please." },
            { role: "user", message: "See you then." },
            { role: "agent", message: null },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(callStatus("conv_9")).resolves.toEqual({
      status: "done",
      transcript: [
        { role: "agent", message: "Table for four at eight, please." },
        { role: "user", message: "See you then." },
      ],
    });
  });

  it("reports in-progress rather than throwing when the conversation is not readable yet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    await expect(callStatus("conv_9")).resolves.toEqual({ status: "in-progress", transcript: [] });
  });
});
