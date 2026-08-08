import { describe, expect, it } from "vitest";
import fixture from "../fixtures/factsheet.example.json";
import { FactSheetSchema, factsheetToVariables } from "../lib/factsheet";
import { placeholders, promptFile } from "../lib/prompt";

/**
 * The prompt and the Fact Sheet are two halves of one contract, edited by two
 * different people. A renamed field leaves an unsubstituted {{placeholder}} in
 * the agent's mouth on stage, which is silent until it isn't.
 *
 * This covers the whole file, so the first-message field is checked too — not
 * just the system prompt block that evals/grade.test.ts renders.
 */
describe("system prompt placeholders", () => {
  const found = placeholders(promptFile());
  const variables = factsheetToVariables(FactSheetSchema.parse(fixture));

  it("finds placeholders at all — guards against a broken regex", () => {
    expect(found.length).toBeGreaterThan(5);
  });

  it("every placeholder is supplied by factsheetToVariables()", () => {
    expect(found.filter((p) => !(p in variables))).toEqual([]);
  });
});
