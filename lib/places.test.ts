import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/apify.places.json";
import { normalizePlace, searchPlaces } from "./places";
import { placesKey } from "./supabase";

describe("placesKey", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(placesKey("  Lebanese Restaurant ", " JLT Dubai ")).toBe(
      placesKey("lebanese restaurant", "jlt dubai"),
    );
  });

  it("collapses runs of internal whitespace", () => {
    expect(placesKey("lebanese   restaurant", "jlt")).toBe(placesKey("lebanese restaurant", "jlt"));
  });

  it("keeps different areas apart", () => {
    expect(placesKey("lebanese", "jlt")).not.toBe(placesKey("lebanese", "downtown"));
  });

  it("treats a missing area as empty, not as a wildcard", () => {
    expect(placesKey("lebanese")).toBe("lebanese|");
    expect(placesKey("lebanese")).not.toBe(placesKey("lebanese", "jlt"));
  });
});

describe("normalizePlace", () => {
  it("normalizes a full item", () => {
    expect(normalizePlace(fixture[0])).toEqual({
      name: "Qamar Table",
      address: "Cluster D, Jumeirah Lake Towers, Dubai",
      phone: "+971 4 123 4567",
      website: "https://qamartable.ae/",
      rating: 4.6,
      reviews: 812,
      categories: ["Lebanese restaurant", "Middle Eastern restaurant"],
      lat: 25.0693,
      lng: 55.1412,
    });
  });

  it("keeps unpublished fields null rather than inventing them", () => {
    const place = normalizePlace(fixture[1]);
    expect(place?.phone).toBeNull();
    expect(place?.website).toBeNull();
    expect(place?.rating).toBeNull();
  });

  it("falls back to categoryName when categories is empty", () => {
    expect(normalizePlace(fixture[1])?.categories).toEqual(["Lebanese restaurant"]);
  });

  it("rejects an item with no name", () => {
    expect(normalizePlace({ address: "somewhere" })).toBeNull();
  });

  it("rejects a non-object", () => {
    expect(normalizePlace("Qamar Table")).toBeNull();
  });
});

describe("searchPlaces", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("APIFY_TOKEN", "test-token");
    vi.restoreAllMocks();
  });

  it("folds the area into the search string rather than using locationQuery", async () => {
    // locationQuery resolves colloquial areas to a 0km² point-of-interest
    // polygon and silently returns nothing. Regression guard — see lib/places.ts.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));

    await searchPlaces("Lebanese restaurant", { area: "JLT Dubai" });

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit | undefined];
    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(sent.searchStringsArray).toEqual(["Lebanese restaurant in JLT Dubai"]);
    expect(sent).not.toHaveProperty("locationQuery");
  });

  it("uses the bare query when no area is given", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));

    await searchPlaces("Qamar Table");

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit | undefined];
    expect((JSON.parse(String(init?.body)) as Record<string, unknown>).searchStringsArray).toEqual([
      "Qamar Table",
    ]);
  });

  it("sends the query and limit to the actor and returns normalized places", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));

    const places = await searchPlaces("Lebanese restaurant", { area: "JLT Dubai", limit: 6 });

    expect(places).toHaveLength(2);
    expect(places[0]?.name).toBe("Qamar Table");

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as [string | Request | URL, RequestInit | undefined];

    expect(String(url)).toContain("compass~crawler-google-places");
    expect(String(url)).toContain("token=test-token");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      searchStringsArray: ["Lebanese restaurant in JLT Dubai"],
      maxCrawledPlacesPerSearch: 6,
    });
  });

  it("throws a readable error when the actor fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(searchPlaces("x")).rejects.toThrow("apify places search failed");
  });

  it("requires APIFY_TOKEN", async () => {
    vi.stubEnv("APIFY_TOKEN", "");
    await expect(searchPlaces("x")).rejects.toThrow("APIFY_TOKEN is required");
  });
});
