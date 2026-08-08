import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite, pagesToDocument, type CrawledPage } from "./crawl";

/** No test here makes a real request — fetch is stubbed in every case. */
function stubCrawlResponse(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
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
  it("sends the URL to context.dev with a bearer key and main-content-only", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "ctx-test-key");
    const fetchMock = stubCrawlResponse({
      results: [{ markdown: "# Serene", metadata: { url: "https://x.test/", title: "Home" } }],
    });

    await crawlSite("https://x.test/");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.context.dev/v1/web/crawl");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ctx-test-key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      url: "https://x.test/",
      useMainContentOnly: true,
    });
  });

  it("accepts CONTEXT_API_KEY as a fallback name", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "");
    vi.stubEnv("CONTEXT_API_KEY", "older-name");
    const fetchMock = stubCrawlResponse({ results: [{ markdown: "x", metadata: {} }] });

    await crawlSite("https://x.test/");

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer older-name");
  });

  it("drops pages that crawled to nothing", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "k");
    stubCrawlResponse({
      results: [
        { markdown: "real content", metadata: { url: "https://x.test/a", title: "A" } },
        { markdown: "   ", metadata: { url: "https://x.test/b", title: "B" } },
        { markdown: "", metadata: { url: "https://x.test/c" } },
      ],
    });

    const pages = await crawlSite("https://x.test/");
    expect(pages.map((p) => p.url)).toEqual(["https://x.test/a"]);
  });

  it("throws on a non-2xx rather than returning an empty crawl", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "k");
    stubCrawlResponse({ message: "nope" }, false, 402);
    await expect(crawlSite("https://x.test/")).rejects.toThrow("402");
  });

  it("throws before any request when no key is configured", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "");
    vi.stubEnv("CONTEXT_API_KEY", "");
    const fetchMock = stubCrawlResponse({});
    await expect(crawlSite("https://x.test/")).rejects.toThrow(/CONTEXT_DEV_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pagesToDocument", () => {
  const pages: CrawledPage[] = [
    { url: "https://x.test/", title: "Home", markdown: "Welcome" },
    { url: "https://x.test/services", title: "Services", markdown: "Hydrafacial AED 450" },
  ];

  it("labels every page with its source URL so prices keep their provenance", () => {
    const doc = pagesToDocument(pages);
    expect(doc).toContain("## Services");
    expect(doc).toContain("<https://x.test/services>");
    expect(doc).toContain("Hydrafacial AED 450");
  });

  it("falls back to the URL when a page has no title", () => {
    expect(pagesToDocument([{ url: "https://x.test/a", title: "", markdown: "hi" }]))
      .toContain("## https://x.test/a");
  });

  it("truncates at the limit", () => {
    expect(pagesToDocument(pages, 20)).toHaveLength(20);
  });
});
