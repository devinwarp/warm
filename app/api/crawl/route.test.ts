import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "@/fixtures/factsheet.example.json";

const crawlAndExtract = vi.fn();
vi.mock("@/lib/crawl", () => ({
  crawlAndExtract: (...args: unknown[]) => crawlAndExtract(...args),
}));

const getCachedFactSheet = vi.fn();
const cacheFactSheet = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getCachedFactSheet: (...args: unknown[]) => getCachedFactSheet(...args),
  cacheFactSheet: (...args: unknown[]) => cacheFactSheet(...args),
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://test/api/crawl", { method: "POST", body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  crawlAndExtract.mockReset();
  getCachedFactSheet.mockReset().mockResolvedValue(null);
  cacheFactSheet.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/crawl", () => {
  it("400s on a missing or non-string url", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ url: 42 })).status).toBe(400);
  });

  it("400s on a string that is not a URL", async () => {
    expect((await post({ url: "not a url" })).status).toBe(400);
  });

  it("returns the cached sheet without crawling", async () => {
    getCachedFactSheet.mockResolvedValue(fixture);

    const res = await post({ url: "https://example.com" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fixture);
    expect(crawlAndExtract).not.toHaveBeenCalled();
  });

  it("crawls on a cache miss, caches, and passes the level through", async () => {
    crawlAndExtract.mockResolvedValue(fixture);

    const res = await post({ url: "https://example.com", maxPages: 3, maxDepth: 2 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fixture);
    expect(crawlAndExtract).toHaveBeenCalledWith("https://example.com/", {
      maxPages: 3,
      maxDepth: 2,
    });
    expect(cacheFactSheet).toHaveBeenCalledWith("https://example.com/", fixture);
  });

  it("ignores a non-numeric crawl level rather than erroring", async () => {
    crawlAndExtract.mockResolvedValue(fixture);

    await post({ url: "https://example.com", maxPages: "lots" });

    expect(crawlAndExtract).toHaveBeenCalledWith("https://example.com/", {
      maxPages: undefined,
      maxDepth: undefined,
    });
  });

  it("502s with the failure message when extraction throws", async () => {
    crawlAndExtract.mockRejectedValue(new Error("context.dev crawl 403: nope"));

    const res = await post({ url: "https://example.com" });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "context.dev crawl 403: nope" });
    expect(cacheFactSheet).not.toHaveBeenCalled();
  });
});
