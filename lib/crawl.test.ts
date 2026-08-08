import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlLevel, pagesToDocument } from "./crawl";
import type { CrawledPage } from "./contextdev";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("crawlLevel", () => {
  it("defaults to 8 pages, depth 1 — a small business site, not a blog archive", () => {
    expect(crawlLevel()).toEqual({ maxPages: 8, maxDepth: 1 });
  });

  it("reads env defaults", () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "3");
    vi.stubEnv("CRAWL_MAX_DEPTH", "2");
    expect(crawlLevel()).toEqual({ maxPages: 3, maxDepth: 2 });
  });

  it("request overrides beat env, and are clamped", () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "3");
    expect(crawlLevel({ maxPages: 999, maxDepth: -5 })).toEqual({ maxPages: 20, maxDepth: 0 });
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
    expect(pagesToDocument([{ url: "https://x.test/a", title: "", markdown: "hi" }])).toContain(
      "## https://x.test/a",
    );
  });

  it("puts fact-bearing pages first, because the limit truncates the tail", () => {
    const doc = pagesToDocument([
      { url: "https://x.test/blog/post", title: "Blog", markdown: "blog words" },
      { url: "https://x.test/pricing", title: "Pricing", markdown: "AED 120" },
    ]);

    expect(doc.indexOf("## Pricing")).toBeLessThan(doc.indexOf("## Blog"));
  });

  it("truncates at the limit", () => {
    expect(pagesToDocument(pages, 20)).toHaveLength(20);
  });
});
