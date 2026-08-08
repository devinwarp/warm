import { describe, expect, it } from "vitest";
import { SITES, type DemoSlug, fallbackLine, isDemoSlug, renderSite } from "./demo";

describe("demo sites", () => {
  const slugs = Object.keys(SITES) as DemoSlug[];

  it("every fallback names a real preset", () => {
    for (const slug of slugs) {
      expect(SITES[slug].presets[SITES[slug].fallback]).toBeTruthy();
      expect(fallbackLine(slug)).toContain(" ");
    }
  });

  it("rejects anything that is not a fixture site", () => {
    expect(isDemoSlug("ruwaya")).toBe(true);
    expect(isDemoSlug("constructor")).toBe(false);
    expect(isDemoSlug("../../etc/passwd")).toBe(false);
  });

  // The whole demo hangs on this: no marker in the HTML means the status line
  // silently never changes, and the live tier looks broken on stage.
  it.each(slugs)("%s has an injection point and takes the line", async (slug) => {
    const rendered = await renderSite(slug, "SENTINEL LINE");
    expect(rendered).toContain("<span>SENTINEL LINE</span>");
    expect(rendered).not.toContain("<!--STATUS-->");
  });

  it("keeps the rest of the page intact", async () => {
    const rendered = await renderSite("ruwaya", fallbackLine("ruwaya"));
    expect(rendered).toContain("Ruwaya Hair Studio");
    expect(rendered).toContain("AED 220");
  });
});
