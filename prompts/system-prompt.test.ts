import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "../fixtures/factsheet.example.json";
import { FactSheetSchema, factsheetToVariables } from "../lib/factsheet";

/**
 * The prompt and the Fact Sheet are two halves of one contract, edited by two
 * different people. A renamed field leaves an unsubstituted {{placeholder}} in
 * the agent's mouth on stage, which is silent until it isn't.
 */
const prompt = readFileSync(new URL("./system-prompt.md", import.meta.url), "utf8");
const placeholders = [...prompt.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!);

describe("system prompt placeholders", () => {
  const variables = factsheetToVariables(FactSheetSchema.parse(fixture));

  it("finds placeholders at all — guards against a broken regex", () => {
    expect(placeholders.length).toBeGreaterThan(5);
  });

  it("every placeholder is supplied by factsheetToVariables()", () => {
    const unknown = [...new Set(placeholders)].filter((p) => !(p in variables));
    expect(unknown).toEqual([]);
  });
});
