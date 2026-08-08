import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contextdev", () => ({
  scrapeMarkdown: vi.fn().mockResolvedValue("# Pricing\nHaircut AED 120"),
  sitemapUrls: vi.fn().mockResolvedValue(["https://x.com/", "https://x.com/pricing"]),
}));

const completeMock = vi.fn();
vi.mock("@/lib/llm", () => ({ complete: (...args: unknown[]) => completeMock(...args) }));

import { lookupLive, routeQuestion } from "./lookup";

describe("routeQuestion", () => {
  const urls = ["https://x.com/", "https://x.com/pricing", "https://x.com/contact"];

  it("routes a price question to the pricing page", () => {
    expect(routeQuestion("how much is a haircut?", urls)).toBe("https://x.com/pricing");
  });

  it("routes an hours question to the contact page", () => {
    expect(routeQuestion("are you open tonight?", urls)).toBe("https://x.com/contact");
  });

  it("returns null for a question with no route", () => {
    expect(routeQuestion("do you like jazz?", urls)).toBeNull();
  });
});

describe("lookupLive", () => {
  const signal = new AbortController().signal;

  it("returns the model's answer when the page covers it", async () => {
    completeMock.mockResolvedValue("A haircut is AED 120.");
    await expect(lookupLive("how much is a haircut?", "https://x.com", signal)).resolves.toBe(
      "A haircut is AED 120.",
    );
  });

  it("throws on NOT_FOUND so the route falls back to answer: null", async () => {
    completeMock.mockResolvedValue("NOT_FOUND");
    await expect(lookupLive("do you sell yachts?", "https://x.com", signal)).rejects.toThrow(
      "no answer",
    );
  });
});
