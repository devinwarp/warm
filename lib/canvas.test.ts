import { describe, expect, it } from "vitest";
import { canvasReducer, type Card } from "./canvas";
import type { Place } from "./places";

const place: Place = {
  name: "Qamar Table",
  address: "JLT Cluster D, Dubai",
  phone: "+97141234567",
  website: "https://qamartable.ae",
  rating: 4.6,
  reviews: 812,
  categories: ["Lebanese restaurant"],
  lat: 25.069,
  lng: 55.141,
  google_url: "https://maps.google.com/?cid=1",
  review_tags: ["hummus"],
};

const candidates: Card = { id: "a", kind: "candidates", places: [place], chosen: null };

describe("canvasReducer", () => {
  it("appends a card", () => {
    expect(canvasReducer([], { type: "add", card: candidates })).toEqual([candidates]);
  });

  it("records a choice on the matching card only", () => {
    const other: Card = { id: "b", kind: "restaurants", places: [place], chosen: null };
    const next = canvasReducer([candidates, other], { type: "choose", id: "b", index: 0 });

    expect(next[0]).toEqual(candidates);
    expect(next[1]).toEqual({ ...other, chosen: 0 });
  });

  it("confirms an area card", () => {
    const area: Card = { id: "c", kind: "area", area: "JLT", lat: 25.06, lng: 55.14, confirmed: false };
    const next = canvasReducer([area], { type: "choose", id: "c", index: 0 });
    expect(next[0]).toEqual({ ...area, confirmed: true });
  });

  it("updates a call card's status and transcript", () => {
    const call: Card = {
      id: "d",
      kind: "call",
      restaurant: "Qamar Table",
      conversationId: "conv_1",
      status: "initiated",
      transcript: [],
    };
    const next = canvasReducer([call], {
      type: "call",
      id: "d",
      status: "done",
      transcript: [{ role: "agent", message: "Table for four at eight." }],
    });

    expect(next[0]).toEqual({
      ...call,
      status: "done",
      transcript: [{ role: "agent", message: "Table for four at eight." }],
    });
  });

  it("ignores an action for an unknown id", () => {
    expect(canvasReducer([candidates], { type: "choose", id: "nope", index: 0 })).toEqual([candidates]);
  });
});
