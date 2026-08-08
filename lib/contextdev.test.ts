import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite, scrapeMarkdown, sitemapUrls } from "./contextdev";

/** No test here makes a real request — fetch is stubbed in every case. */
function stubResponse(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("crawlSite", () => {
  it("sends the URL and crawl level with a bearer key and main-content-only", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "ctx-test-key");
    const fetchMock = stubResponse({
      results: [{ markdown: "# Serene", metadata: { url: "https://x.test/", title: "Home" } }],
    });

    await crawlSite("https://x.test/", { maxPages: 5, maxDepth: 2 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.context.dev/v1/web/crawl");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer ctx-test-key");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      url: "https://x.test/",
      maxPages: 5,
      maxDepth: 2,
      useMainContentOnly: true,
    });
  });

  it("accepts CONTEXT_API_KEY as a fallback name", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "");
    vi.stubEnv("CONTEXT_API_KEY", "older-name");
    const fetchMock = stubResponse({ results: [{ markdown: "x", metadata: {} }] });

    await crawlSite("https://x.test/", { maxPages: 8, maxDepth: 1 });

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer older-name");
  });

  it("drops pages that crawled to nothing", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "k");
    stubResponse({
      results: [
        { markdown: "real content", metadata: { url: "https://x.test/a", title: "A" } },
        { markdown: "   ", metadata: { url: "https://x.test/b", title: "B" } },
        { markdown: "", metadata: { url: "https://x.test/c" } },
      ],
    });

    const pages = await crawlSite("https://x.test/", { maxPages: 8, maxDepth: 1 });
    expect(pages.map((p) => p.url)).toEqual(["https://x.test/a"]);
  });

  it("throws on a non-2xx rather than returning an empty crawl", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "k");
    stubResponse({ message: "nope" }, false, 402);
    await expect(crawlSite("https://x.test/", { maxPages: 8, maxDepth: 1 })).rejects.toThrow("402");
  });

  it("throws before any request when no key is configured", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "");
    vi.stubEnv("CONTEXT_API_KEY", "");
    const fetchMock = stubResponse({});

    await expect(crawlSite("https://x.test/", { maxPages: 8, maxDepth: 1 })).rejects.toThrow(
      /CONTEXT_DEV_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("scrapeMarkdown", () => {
  it("asks for a fresh read — a cached scrape defeats the live tier", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "k");
    const fetchMock = stubResponse({ success: true, markdown: "# Hi" });

    await expect(scrapeMarkdown("https://x.test/")).resolves.toBe("# Hi");

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/web/scrape/markdown?");
    expect(url).toContain("maxAgeMs=0");
    expect(url).toContain("useMainContentOnly=true");
  });

  it("surfaces the status when the scrape fails", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "k");
    stubResponse({ message: "forbidden" }, false, 403);
    await expect(scrapeMarkdown("https://x.test/")).rejects.toThrow("403");
  });
});

describe("sitemapUrls", () => {
  it("returns the discovered URLs", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "k");
    stubResponse({ urls: ["https://x.test/", "https://x.test/pricing", 42] });

    await expect(sitemapUrls("https://x.test/", 100)).resolves.toEqual([
      "https://x.test/",
      "https://x.test/pricing",
    ]);
  });
});
