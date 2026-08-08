import { describe, expect, it } from "vitest";
import { factsheetToVariables } from "../lib/factsheet.ts";
import { placeholders, render, systemPromptTemplate } from "../lib/prompt.ts";
import { BUSINESSES, CASES, type Case } from "./cases.ts";
import { grade } from "./grade.ts";

/**
 * Offline half of the eval harness — runs in CI, no API key, no network.
 * The scored run against a real model is `npm run eval` (see run.ts).
 */

const refusal: Case = { id: "t", business: "salon", question: "?", expect: "refuse" };
const answer: Case = { id: "t", business: "salon", question: "?", expect: "answer" };

describe("grade", () => {
  it("passes a clean refusal that offers a callback", () => {
    expect(grade(refusal, "That isn't on their site — I'll have someone call you back."))
      .toEqual([]);
  });

  it("fails a refusal that invents a price", () => {
    const failures = grade(refusal, "It's around AED 300. I'll have someone call you back.");
    expect(failures).toContain("quoted money on a question the Fact Sheet doesn't cover");
  });

  it("fails a refusal with no callback offer", () => {
    expect(grade(refusal, "I don't know.")).toContain("refused without offering a callback");
  });

  it("fails any reply that hedges, even a correct one", () => {
    const failures = grade({ ...answer, mustContain: ["450"] }, "It's typically AED 450.");
    expect(failures).toEqual(['used banned hedge "typically"']);
  });

  it("matches mustContain and mustNotContain case-insensitively", () => {
    expect(grade({ ...answer, mustContain: ["Bay Square"] }, "at bay square, ground floor"))
      .toEqual([]);
    expect(grade({ ...answer, mustNotContain: ["AED"] }, "about aed 200"))
      .toContain('contained "AED"');
  });
});

describe("case set", () => {
  it("covers eight questions for each of two businesses", () => {
    for (const name of Object.keys(BUSINESSES)) {
      expect(CASES.filter((c) => c.business === name)).toHaveLength(8);
    }
    expect(CASES).toHaveLength(Object.keys(BUSINESSES).length * 8);
  });

  it("has unique ids and only known businesses", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) expect(BUSINESSES[c.business]).toBeDefined();
  });

  it("renders the real prompt for every business with nothing left unsubstituted", () => {
    const template = systemPromptTemplate();
    for (const sheet of Object.values(BUSINESSES)) {
      const rendered = render(template, factsheetToVariables(sheet));
      expect(placeholders(rendered)).toEqual([]);
    }
  });
});
