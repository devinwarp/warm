import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crawlSite, scrapeMarkdown } from "./contextdev";

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.CONTEXT_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("scrapeMarkdown", () => {
  it("sends bearer auth and returns the markdown", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, markdown: "# Hi" }));

    await expect(scrapeMarkdown("https://x.com")).resolves.toBe("# Hi");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/web/scrape/markdown?");
    expect(url).toContain("useMainContentOnly=true");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
  });

  it("surfaces API errors with the status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "nope" }, 403));
    await expect(scrapeMarkdown("https://x.com")).rejects.toThrow("403");
  });
});

describe("crawlSite", () => {
  it("passes the level and keeps only successful pages with content", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          { markdown: "# A", metadata: { url: "https://x.com", success: true } },
          { markdown: "", metadata: { url: "https://x.com/empty", success: true } },
          { markdown: "# B", metadata: { url: "https://x.com/404", success: false } },
        ],
      }),
    );

    const pages = await crawlSite("https://x.com", { maxPages: 5, maxDepth: 2 });
    expect(pages).toEqual([{ url: "https://x.com", markdown: "# A" }]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ maxPages: 5, maxDepth: 2 });
  });

  it("throws when no page is usable — a silent empty sheet is worse", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
    await expect(crawlSite("https://x.com", { maxPages: 5, maxDepth: 1 })).rejects.toThrow(
      "no usable pages",
    );
  });
});
