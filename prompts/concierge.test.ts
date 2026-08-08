import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The prompt names the tools; canvas.tsx registers them. Nothing at runtime
 * catches a mismatch — the agent just calls a tool that is not there and the
 * conversation dead-ends. This test is that catch.
 */

const prompt = readFileSync(new URL("./concierge-prompt.md", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../app/canvas.tsx", import.meta.url), "utf8");
const booker = readFileSync(new URL("./booker-prompt.md", import.meta.url), "utf8");
const booking = readFileSync(new URL("../lib/booking.ts", import.meta.url), "utf8");

const TOOLS = [
  "find_business",
  "confirm_business",
  "resolve_area",
  "search_restaurants",
  "check_live",
  "book_table",
];

/** The dynamic variables lib/booking.ts injects into the Booker agent. */
const BOOKER_VARS = ["restaurant_name", "party_size", "when", "customer_name", "customer_phone"];

describe("concierge prompt", () => {
  it.each(TOOLS)("names %s, and canvas.tsx registers it", (tool) => {
    expect(prompt).toContain(tool);
    expect(canvas).toContain(`useConversationClientTool("${tool}"`);
  });

  it("registers no tool the prompt does not mention", () => {
    const registered = [...canvas.matchAll(/useConversationClientTool\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(registered.sort()).toEqual([...TOOLS].sort());
  });
});

describe("booker prompt", () => {
  it.each(BOOKER_VARS)("uses {{%s}}, and lib/booking.ts injects it", (name) => {
    expect(booker).toContain(`{{${name}}}`);
    expect(booking).toContain(`${name}:`);
  });

  it("uses no placeholder lib/booking.ts does not inject", () => {
    const used = [...booker.matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]);
    expect([...new Set(used)].sort()).toEqual([...BOOKER_VARS].sort());
  });
});
