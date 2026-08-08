import { describe, expect, it } from "vitest";
import fixture from "../fixtures/factsheet.example.json";
import { FactSheetSchema, NOT_PUBLISHED, factsheetToVariables } from "./factsheet";

describe("FactSheetSchema", () => {
  it("accepts the shared fixture", () => {
    expect(() => FactSheetSchema.parse(fixture)).not.toThrow();
  });

  it("rejects a payload missing a required field", () => {
    const { hours, ...missing } = FactSheetSchema.parse(fixture);
    expect(() => FactSheetSchema.parse(missing)).toThrow();
  });

  it("rejects a numeric price — sites publish 'from AED 150'", () => {
    const sheet = FactSheetSchema.parse(fixture);
    const bad = { ...sheet, services: [{ ...sheet.services[0], price: 150 }] };
    expect(() => FactSheetSchema.parse(bad)).toThrow();
  });
});

describe("factsheetToVariables", () => {
  it("flattens nested arrays into speakable strings", () => {
    const vars = factsheetToVariables(FactSheetSchema.parse(fixture));
    expect(vars.services).toContain("Hydrafacial");
    expect(vars.locations).toContain("Al Wasl Road");
    expect(Object.values(vars).every((v) => typeof v === "string")).toBe(true);
  });

  it("renders every empty or null field as NOT_PUBLISHED, never as ''", () => {
    const vars = factsheetToVariables({
      ...FactSheetSchema.parse(fixture),
      services: [],
      locations: [],
      hours: "",
      booking_policy: null,
      languages_spoken: [],
    });

    for (const key of ["services", "locations", "hours", "booking_policy", "languages_spoken"]) {
      expect(vars[key]).toBe(NOT_PUBLISHED);
    }
  });
});
