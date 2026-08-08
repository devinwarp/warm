import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/apify.places.json";
import { normalizePlace, searchPlaces } from "./places";

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
      searchStringsArray: ["Lebanese restaurant"],
      locationQuery: "JLT Dubai",
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
