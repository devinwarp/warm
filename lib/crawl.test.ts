import { afterEach, describe, expect, it } from "vitest";
import { crawlLevel, pagesToText } from "./crawl";

describe("crawlLevel", () => {
  afterEach(() => {
    delete process.env.CRAWL_MAX_PAGES;
    delete process.env.CRAWL_MAX_DEPTH;
  });

  it("defaults to 8 pages, depth 1", () => {
    expect(crawlLevel()).toEqual({ maxPages: 8, maxDepth: 1 });
  });

  it("reads env defaults", () => {
    process.env.CRAWL_MAX_PAGES = "3";
    process.env.CRAWL_MAX_DEPTH = "2";
    expect(crawlLevel()).toEqual({ maxPages: 3, maxDepth: 2 });
  });

  it("request overrides beat env, and are clamped", () => {
    process.env.CRAWL_MAX_PAGES = "3";
    expect(crawlLevel({ maxPages: 999, maxDepth: -5 })).toEqual({ maxPages: 20, maxDepth: 0 });
  });
});

describe("pagesToText", () => {
  it("puts fact-bearing pages first and labels each page", () => {
    const text = pagesToText([
      { url: "https://x.com/blog/post", markdown: "blog words" },
      { url: "https://x.com/pricing", markdown: "AED 120" },
    ]);

    expect(text.indexOf("PAGE: https://x.com/pricing")).toBeLessThan(
      text.indexOf("PAGE: https://x.com/blog/post"),
    );
    expect(text).toContain("AED 120");
  });

  it("caps total output at maxChars", () => {
    const pages = [{ url: "https://x.com", markdown: "a".repeat(500) }];
    expect(pagesToText(pages, 100).length).toBe(100);
  });
});
