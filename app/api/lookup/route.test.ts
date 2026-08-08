import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupLive = vi.fn();
vi.mock("@/lib/lookup", () => ({
  lookupLive: (...args: unknown[]) => lookupLive(...args),
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://test/api/lookup", { method: "POST", body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  lookupLive.mockReset();
});

describe("POST /api/lookup", () => {
  it("400s unless question and source_url are both strings", async () => {
    expect((await post({ question: "hi" })).status).toBe(400);
    expect((await post({ source_url: "https://x.com" })).status).toBe(400);
    expect((await post({ question: 1, source_url: "https://x.com" })).status).toBe(400);
  });

  it("returns the answer with source and a fetch timestamp", async () => {
    lookupLive.mockResolvedValue("Open until 10pm tonight.");

    const res = await post({ question: "open tonight?", source_url: "https://x.com" });
    const body = (await res.json()) as { answer: string; source_url: string; fetched_at: string };

    expect(res.status).toBe(200);
    expect(body.answer).toBe("Open until 10pm tonight.");
    expect(body.source_url).toBe("https://x.com");
    expect(new Date(body.fetched_at).getTime()).not.toBeNaN();
    expect(lookupLive).toHaveBeenCalledWith(
      "open tonight?",
      "https://x.com",
      expect.any(AbortSignal),
    );
  });

  it("never returns a dead line: a lookup failure is a 200 with answer null", async () => {
    lookupLive.mockRejectedValue(new Error("live lookup found no answer on the page"));

    const res = await post({ question: "do you sell yachts?", source_url: "https://x.com" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      answer: null,
      source_url: "https://x.com",
      fetched_at: null,
    });
  });
});
