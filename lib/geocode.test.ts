import { beforeEach, describe, expect, it, vi } from "vitest";
import { geocode } from "./geocode";

const hit = [{ display_name: "Jumeirah Lake Towers, Dubai, UAE", lat: "25.0693", lon: "55.1412" }];

describe("geocode", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns the first match with numeric coordinates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(hit), { status: 200 }));
    await expect(geocode("JLT Dubai")).resolves.toEqual({
      label: "Jumeirah Lake Towers, Dubai, UAE",
      lat: 25.0693,
      lng: 55.1412,
    });
  });

  it("returns null when nothing matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    await expect(geocode("asdfghjkl")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the service is down", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));
    await expect(geocode("JLT")).resolves.toBeNull();
  });

  it("sends a User-Agent, which Nominatim requires", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(hit), { status: 200 }));
    await geocode("JLT");

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call as [unknown, RequestInit | undefined];
    expect(new Headers(init?.headers).get("user-agent")).toBeTruthy();
  });
});
