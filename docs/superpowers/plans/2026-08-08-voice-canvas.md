# Voice Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into a voice canvas where a Concierge agent finds businesses, reads their sites, searches restaurants, and places a real outbound call to book a table — painting a generative UI as it goes.

**Architecture:** One ElevenLabs agent drives the page through *client tools* registered with `useConversationClientTool`. Each tool appends a card to an append-only canvas and returns one line of speech-register text to the agent. Card taps travel the other way as `sendContextualUpdate`. Heavy work lives behind three server routes; the browser never holds a key.

**Tech Stack:** Next.js 16 App Router, React 19, `@elevenlabs/react`, Tailwind v4, zod v4, vitest, Apify (Google Maps actor), Nominatim (geocoding), ElevenLabs Twilio outbound-call API, Supabase (cache only).

**Spec:** `docs/superpowers/specs/2026-08-08-voice-canvas-design.md`

## Global Constraints

- TypeScript strict, no `any`. (`.claude/CLAUDE.md`)
- Auto-commit after every change. (`.claude/CLAUDE.md`)
- Plain Tailwind + local hooks. **Do not** introduce shadcn/ui or zustand — `.claude/rules/frontend.md` says otherwise and is wrong; Task 9 fixes the rules file.
- Existing colour tokens only: `ink`, `panel`, `line`, `fg`, `mute`, `lamp`, `fault`. Fonts: `font-sans`, `font-mono`, `font-display`.
- Nullability discipline from the Fact Sheet: if a source did not publish a field, it is `null`. Nothing is inferred, ever.
- Every client tool returns **immediately** and returns a **string**. None may block on a human.
- `lib/factsheet.ts` is a frozen contract. Do not modify it.
- Tests are vitest, mocked at the module boundary with `vi.mock`, no network. Match the style of `lib/lookup.test.ts`.
- Run `npm run typecheck && npm test` before every commit.

---

### Task 1: Move the console aside and scaffold the canvas

Frees `/` and puts the empty canvas shell in place. Nothing else can start until the route split exists.

**Files:**
- Create: `app/console/page.tsx`
- Create: `app/canvas.tsx`
- Modify: `app/page.tsx`
- Modify: `package.json` (add `@elevenlabs/react`)

**Interfaces:**
- Consumes: nothing.
- Produces: `<Canvas agentId={string | null} />` default-exported from `app/canvas.tsx`; `/console` renders the existing `<Console />` unchanged.

- [ ] **Step 1: Install the React SDK**

```bash
npm install @elevenlabs/react
```

- [ ] **Step 2: Create the console route**

Create `app/console/page.tsx`:

```tsx
import { Console } from "../console";

/**
 * The original Dial console. Still the fallback demo, and still the agent that
 * answers the demo booking number as the restaurant (see the voice-canvas spec).
 */
export default function ConsolePage() {
  return <Console agentId={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? null} />;
}
```

- [ ] **Step 3: Create the canvas shell**

Create `app/canvas.tsx`. This is the shell only — tools land in later tasks.

```tsx
"use client";

import { useConversation } from "@elevenlabs/react";
import { useCallback, useState } from "react";

/**
 * The voice canvas. The visitor talks; the agent paints cards through client
 * tools. Taps travel back as contextual updates, never as tool return values —
 * a tool that waits on a human hangs the conversation.
 */
export function Canvas({ agentId }: { agentId: string | null }) {
  const [live, setLive] = useState(false);
  const conversation = useConversation({
    onConnect: () => setLive(true),
    onDisconnect: () => setLive(false),
  });

  const start = useCallback(async () => {
    if (!agentId) return;
    await navigator.mediaDevices.getUserMedia({ audio: true });
    await conversation.startSession({ agentId, connectionType: "webrtc" });
  }, [agentId, conversation]);

  if (!agentId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="font-mono text-xs text-fault">
          NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID is not set. See .env.example.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 px-6 py-14">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Dial</h1>
        <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-mute uppercase">
          <span className={`size-2 rounded-full ${live ? "lamp-live bg-lamp" : "bg-line"}`} aria-hidden />
          {live ? "listening" : "line idle"}
        </div>
      </header>

      {!live && (
        <section className="flex flex-col gap-4">
          <p className="max-w-md text-mute">
            Tell it a business you want to know about, or a table you want booked.
            It will find it, read it, and call them for you.
          </p>
          <button
            type="button"
            onClick={start}
            className="self-start rounded-md bg-lamp px-5 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Start talking
          </button>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Point the landing page at the canvas**

Replace `app/page.tsx` entirely:

```tsx
import { Canvas } from "./canvas";

export default function Page() {
  return <Canvas agentId={process.env.NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID ?? null} />;
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass. `/` and `/console` both appear in the route list.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/page.tsx app/canvas.tsx app/console/page.tsx
git commit -m "Move the Dial console to /console, scaffold the voice canvas at /"
```

---

### Task 2: The card model and reducer

Pure data. No React, no network. Everything else renders off this.

**Files:**
- Create: `lib/canvas.ts`
- Test: `lib/canvas.test.ts`

**Interfaces:**
- Consumes: `Place` from Task 3 — **but that type does not exist yet**. Define `Place` in `lib/places.ts` as part of this task's Step 1 so the reducer can import it; Task 3 fills in the functions around it.
- Produces: `Card`, `CanvasAction`, `canvasReducer(cards: Card[], action: CanvasAction): Card[]`.

- [ ] **Step 1: Create the Place type**

Create `lib/places.ts` with the type only:

```ts
/**
 * A place as the Google Maps actor sees it, normalized. Same nullability
 * discipline as the Fact Sheet: unpublished is null, nothing is inferred.
 */
export type Place = {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  categories: string[];
  lat: number;
  lng: number;
};
```

- [ ] **Step 2: Write the failing test**

Create `lib/canvas.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/canvas.test.ts`
Expected: FAIL — `Failed to resolve import "./canvas"`.

- [ ] **Step 4: Write the reducer**

Create `lib/canvas.ts`:

```ts
import type { FactSheet } from "./factsheet";
import type { Place } from "./places";

/**
 * The canvas is append-only: the agent paints, it never erases. A conversation
 * reads as a transcript of what was found, which is also what the audience
 * needs to follow on a stage.
 */

export type TranscriptTurn = { role: string; message: string };

export type Card = { id: string } & (
  | { kind: "candidates"; places: Place[]; chosen: number | null }
  | { kind: "factsheet"; sheet: FactSheet }
  | { kind: "area"; area: string; lat: number; lng: number; confirmed: boolean }
  | { kind: "restaurants"; places: Place[]; chosen: number | null }
  | {
      kind: "call";
      restaurant: string;
      conversationId: string | null;
      status: string;
      transcript: TranscriptTurn[];
    }
  | { kind: "fault"; text: string }
);

export type CanvasAction =
  | { type: "add"; card: Card }
  | { type: "choose"; id: string; index: number }
  | { type: "call"; id: string; status: string; transcript: TranscriptTurn[] };

export function canvasReducer(cards: Card[], action: CanvasAction): Card[] {
  if (action.type === "add") return [...cards, action.card];

  return cards.map((card) => {
    if (card.id !== action.id) return card;

    if (action.type === "choose") {
      if (card.kind === "candidates" || card.kind === "restaurants") {
        return { ...card, chosen: action.index };
      }
      // An area card has one thing to choose, so any choice confirms it.
      if (card.kind === "area") return { ...card, confirmed: true };
      return card;
    }

    if (card.kind === "call") {
      return { ...card, status: action.status, transcript: action.transcript };
    }
    return card;
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/canvas.test.ts`
Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas.ts lib/canvas.test.ts lib/places.ts
git commit -m "Add the canvas card model and reducer"
```

---

### Task 3: Places — Apify Google Maps behind one route

Serves both use cases. `find_business` and `search_restaurants` differ only in the query string they send.

**Files:**
- Modify: `lib/places.ts`
- Create: `lib/places.test.ts`
- Create: `app/api/places/route.ts`
- Create: `fixtures/apify.places.json`

**Interfaces:**
- Consumes: `Place` (Task 2 Step 1).
- Produces: `normalizePlace(item: unknown): Place | null`, `searchPlaces(query: string, opts?: { area?: string; limit?: number; signal?: AbortSignal }): Promise<Place[]>`. `POST /api/places` with `{ query: string, area?: string, limit?: number }` → `{ places: Place[] }` or `{ error: string }`.

- [ ] **Step 1: Commit a fixture of the actor's real item shape**

Create `fixtures/apify.places.json`:

```json
[
  {
    "title": "Qamar Table",
    "address": "Cluster D, Jumeirah Lake Towers, Dubai",
    "phone": "+971 4 123 4567",
    "website": "https://qamartable.ae/",
    "totalScore": 4.6,
    "reviewsCount": 812,
    "categoryName": "Lebanese restaurant",
    "categories": ["Lebanese restaurant", "Middle Eastern restaurant"],
    "location": { "lat": 25.0693, "lng": 55.1412 }
  },
  {
    "title": "Al Nafoorah",
    "address": "Jumeirah Emirates Towers, Dubai",
    "phone": null,
    "website": null,
    "totalScore": null,
    "reviewsCount": 0,
    "categoryName": "Lebanese restaurant",
    "categories": [],
    "location": { "lat": 25.2172, "lng": 55.2825 }
  }
]
```

- [ ] **Step 2: Write the failing test**

Create `lib/places.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
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
    expect(places[0].name).toBe("Qamar Table");

    const [url, init] = fetchMock.mock.calls[0];
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/places.test.ts`
Expected: FAIL — `normalizePlace is not a function`.

- [ ] **Step 4: Implement the client**

Append to `lib/places.ts` (keep the `Place` type from Task 2 at the top):

```ts
/**
 * Apify's Google Maps actor, called run-sync so one fetch is the whole job.
 * Key read lazily per call, same reasoning as lib/contextdev.ts.
 */

const ACTOR = "compass~crawler-google-places";
const DEFAULT_LIMIT = 6;

function apifyToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is required");
  return token;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizePlace(item: unknown): Place | null {
  if (typeof item !== "object" || item === null) return null;
  const raw = item as Record<string, unknown>;

  const name = str(raw.title);
  if (!name) return null;

  const location = (raw.location ?? {}) as Record<string, unknown>;
  const listed = Array.isArray(raw.categories)
    ? raw.categories.filter((c): c is string => typeof c === "string")
    : [];
  const fallback = str(raw.categoryName);

  return {
    name,
    address: str(raw.address) ?? "",
    phone: str(raw.phone),
    website: str(raw.website),
    rating: num(raw.totalScore),
    reviews: num(raw.reviewsCount),
    categories: listed.length > 0 ? listed : fallback ? [fallback] : [],
    lat: num(location.lat) ?? 0,
    lng: num(location.lng) ?? 0,
  };
}

export async function searchPlaces(
  query: string,
  { area, limit = DEFAULT_LIMIT, signal }: { area?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<Place[]> {
  const token = apifyToken();
  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [query],
        ...(area ? { locationQuery: area } : {}),
        // The single biggest latency lever on this actor. Six is enough to
        // fill a grid and short enough to finish inside a conversation.
        maxCrawledPlacesPerSearch: limit,
        language: "en",
        skipClosedPlaces: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`apify places search failed: ${response.status} ${await response.text()}`);
  }

  const items = (await response.json()) as unknown;
  if (!Array.isArray(items)) return [];
  return items.map(normalizePlace).filter((p): p is Place => p !== null);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/places.test.ts`
Expected: 8 passing.

- [ ] **Step 6: Add the route**

Create `app/api/places/route.ts`:

```ts
import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/places";

/**
 * POST /api/places  { query, area?, limit? }  ->  { places: Place[] }
 *
 * Serves both canvas flows: "find this business" and "find restaurants like
 * this near here". One actor, one latency profile to tune.
 */

// The Google Maps actor routinely runs 20-90s. Vercel's default would kill it.
export const maxDuration = 120;

const MAX_LIMIT = 10;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
    area?: unknown;
    limit?: unknown;
  } | null;

  if (typeof body?.query !== "string" || body.query.trim() === "") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const limit =
    typeof body.limit === "number" ? Math.min(Math.max(1, Math.trunc(body.limit)), MAX_LIMIT) : undefined;

  try {
    const places = await searchPlaces(body.query, {
      area: typeof body.area === "string" ? body.area : undefined,
      limit,
    });
    return NextResponse.json({ places });
  } catch (error) {
    const message = error instanceof Error ? error.message : "places search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: all pass.

```bash
git add lib/places.ts lib/places.test.ts app/api/places/route.ts fixtures/apify.places.json
git commit -m "Add the Apify places search behind /api/places"
```

---

### Task 4: Use case A — find a business, confirm it, read its site

End of this task, use case A works end to end. This is the first shippable checkpoint.

**Files:**
- Create: `app/cards.tsx`
- Modify: `app/canvas.tsx`

**Interfaces:**
- Consumes: `canvasReducer`, `Card` (Task 2); `POST /api/places` (Task 3); `POST /api/crawl` (existing); `FactSheetCard` (existing, unchanged); `FactSheetSchema` (existing).
- Produces: `<CardView card={Card} onChoose={(id: string, index: number) => void} />` from `app/cards.tsx`. Later tasks add card kinds to the same switch.

- [ ] **Step 1: Create the card renderer with the two kinds this task needs**

Create `app/cards.tsx`:

```tsx
"use client";

import type { Card } from "@/lib/canvas";
import type { Place } from "@/lib/places";
import { FactSheetCard } from "./factsheet-card";

/**
 * Dumb presentational switch. Every card the agent can paint renders here.
 * Taps call onChoose; they never call a tool directly — the canvas turns a tap
 * into a contextual update and lets the agent decide what happens next.
 */

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-4 rounded-md border border-line bg-panel p-6"
    >
      <h2 className="font-mono text-[11px] tracking-widest text-mute uppercase">{label}</h2>
      {children}
    </section>
  );
}

function PlaceRow({
  place,
  selected,
  onClick,
}: {
  place: Place;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors ${
        selected ? "border-lamp bg-lamp/5" : "border-line hover:border-lamp/60"
      }`}
    >
      <span className="text-sm font-medium">{place.name}</span>
      <span className="text-xs text-mute">{place.address}</span>
      <span className="font-mono text-[11px] text-mute/80">
        {place.rating !== null ? `${place.rating}★` : "unrated"}
        {place.reviews !== null && place.reviews > 0 ? ` · ${place.reviews} reviews` : ""}
        {place.website ? " · has a website" : " · no website"}
      </span>
    </button>
  );
}

export function CardView({
  card,
  onChoose,
}: {
  card: Card;
  onChoose: (id: string, index: number) => void;
}) {
  switch (card.kind) {
    case "candidates":
      return (
        <Shell label="Is this the one?">
          <div className="flex flex-col gap-2">
            {card.places.map((place, i) => (
              <PlaceRow
                key={place.name + i}
                place={place}
                selected={card.chosen === i}
                onClick={() => onChoose(card.id, i)}
              />
            ))}
          </div>
        </Shell>
      );

    case "factsheet":
      return <FactSheetCard sheet={card.sheet} lastRead={{ at: card.sheet.crawled_at, live: false }} />;

    case "fault":
      return (
        <Shell label="That didn't work">
          <p className="text-sm text-fault">{card.text}</p>
        </Shell>
      );

    default:
      return null;
  }
}
```

- [ ] **Step 2: Wire the reducer and the two tools into the canvas**

Rewrite `app/canvas.tsx`. Keep the shell from Task 1 and add everything below.

```tsx
"use client";

import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import { useCallback, useReducer, useRef, useState } from "react";
import { canvasReducer, type Card } from "@/lib/canvas";
import { FactSheetSchema } from "@/lib/factsheet";
import type { Place } from "@/lib/places";
import { CardView } from "./cards";

/**
 * The voice canvas. The visitor talks; the agent paints cards through client
 * tools. Taps travel back as contextual updates, never as tool return values —
 * a tool that waits on a human hangs the conversation.
 */

function id(): string {
  return crypto.randomUUID();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(parsed.error ?? `${path} failed (${response.status})`);
  return parsed;
}

export function Canvas({ agentId }: { agentId: string | null }) {
  const [live, setLive] = useState(false);
  const [cards, dispatch] = useReducer(canvasReducer, [] as Card[]);

  // Tools need to read the latest cards without re-registering on every paint.
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;

  const conversation = useConversation({
    onConnect: () => setLive(true),
    onDisconnect: () => setLive(false),
  });

  const fault = useCallback((text: string) => {
    dispatch({ type: "add", card: { id: id(), kind: "fault", text } });
  }, []);

  /** The last card of a kind — how a tool finds what it just painted. */
  const latest = useCallback(<K extends Card["kind"]>(kind: K) => {
    for (let i = cardsRef.current.length - 1; i >= 0; i--) {
      const card = cardsRef.current[i];
      if (card.kind === kind) return card as Extract<Card, { kind: K }>;
    }
    return null;
  }, []);

  useConversationClientTool(
    "find_business",
    async ({ name, locality }: { name: string; locality?: string }) => {
      try {
        const { places } = await post<{ places: Place[] }>("/api/places", {
          query: name,
          area: locality,
          limit: 3,
        });
        if (places.length === 0) return "no matches — ask them for a different name or area";

        dispatch({ type: "add", card: { id: id(), kind: "candidates", places, chosen: null } });

        const top = places[0];
        return `found ${places.length} — top is ${top.name}, ${top.address}${
          top.website ? `, ${top.website}` : ", but no website to read"
        }. Ask them if that's the one.`;
      } catch (error) {
        fault(error instanceof Error ? error.message : "the search failed");
        return "the search failed — tell them and offer to try again";
      }
    },
  );

  useConversationClientTool("confirm_business", async ({ index }: { index: number }) => {
    const candidates = latest("candidates");
    const place = candidates?.places[index];
    if (!place) return "that wasn't one of the options — ask them which one they meant";
    if (!place.website) return `${place.name} has no website to read — say so`;

    dispatch({ type: "choose", id: candidates.id, index });

    try {
      const sheet = FactSheetSchema.parse(await post("/api/crawl", { url: place.website }));
      dispatch({ type: "add", card: { id: id(), kind: "factsheet", sheet } });
      return `read ${sheet.business_name}: ${sheet.one_line}. ${sheet.services.length} services, hours ${
        sheet.hours || "not published"
      }. Answer their questions from this and nothing else.`;
    } catch (error) {
      fault(error instanceof Error ? error.message : "the crawl failed");
      return "couldn't read their site — tell them plainly and offer to try another";
    }
  });

  const onChoose = useCallback(
    (cardId: string, index: number) => {
      const card = cardsRef.current.find((c) => c.id === cardId);
      if (!card) return;
      dispatch({ type: "choose", id: cardId, index });

      const what =
        card.kind === "candidates" || card.kind === "restaurants"
          ? card.places[index]?.name
          : card.kind === "area"
            ? card.area
            : null;
      if (what) void conversation.sendContextualUpdate(`The visitor tapped ${what} on screen.`);
    },
    [conversation],
  );

  const start = useCallback(async () => {
    if (!agentId) return;
    await navigator.mediaDevices.getUserMedia({ audio: true });
    await conversation.startSession({ agentId, connectionType: "webrtc" });
  }, [agentId, conversation]);

  if (!agentId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="font-mono text-xs text-fault">
          NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID is not set. See .env.example.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 px-6 py-14">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Dial</h1>
        <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-mute uppercase">
          <span className={`size-2 rounded-full ${live ? "lamp-live bg-lamp" : "bg-line"}`} aria-hidden />
          {live ? "listening" : "line idle"}
        </div>
      </header>

      {!live && cards.length === 0 && (
        <section className="flex flex-col gap-4">
          <p className="max-w-md text-mute">
            Tell it a business you want to know about, or a table you want booked.
            It will find it, read it, and call them for you.
          </p>
          <button
            type="button"
            onClick={start}
            className="self-start rounded-md bg-lamp px-5 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Start talking
          </button>
        </section>
      )}

      <div className="flex flex-col gap-6">
        {cards.map((card) => (
          <CardView key={card.id} card={card} onChoose={onChoose} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 4: Verify by hand**

Run `npm run dev`. Configure the Concierge agent in the ElevenLabs dashboard with `find_business` and `confirm_business` as **client tools** matching the parameter names above. Say *"tell me about Qamar Table in JLT"*.
Expected: candidate cards appear, agent asks to confirm, Fact Sheet renders, agent answers questions from it.

- [ ] **Step 5: Commit**

```bash
git add app/cards.tsx app/canvas.tsx
git commit -m "Use case A: find a business by name, confirm it, read its site"
```

---

### Task 5: Area confirmation

Geocoding is a separate, fast step so the visitor confirms *before* paying the Apify latency. This is the whole reason the flow feels quick.

**Files:**
- Create: `lib/geocode.ts`
- Create: `lib/geocode.test.ts`
- Create: `app/api/geocode/route.ts`
- Modify: `app/cards.tsx`
- Modify: `app/canvas.tsx`

**Interfaces:**
- Consumes: `Card` (Task 2), `CardView` (Task 4).
- Produces: `geocode(query: string, signal?: AbortSignal): Promise<{ label: string; lat: number; lng: number } | null>`. `POST /api/geocode` with `{ query: string }` → `{ area: { label, lat, lng } | null }`.

- [ ] **Step 1: Write the failing test**

Create `lib/geocode.test.ts`:

```ts
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
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("user-agent")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/geocode.test.ts`
Expected: FAIL — `Failed to resolve import "./geocode"`.

- [ ] **Step 3: Implement**

Create `lib/geocode.ts`:

```ts
/**
 * Nominatim. No key, no dependency, sub-second — which is the point: the
 * visitor confirms the area before we spend 20-90s in the Apify actor.
 *
 * ponytail: never throws. A failed geocode should skip the confirm step, not
 * kill the conversation. Upgrade path is a paid geocoder if rate limits bite.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Nominatim's usage policy requires an identifying User-Agent.
const UA = "dial-voice-canvas (https://github.com/shameerthaha/warm-hackathondemo)";

const TIMEOUT_MS = 4000;

export type Area = { label: string; lat: number; lng: number };

export async function geocode(query: string, signal?: AbortSignal): Promise<Area | null> {
  const url = `${NOMINATIM}?${new URLSearchParams({ q: query, format: "json", limit: "1" })}`;

  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body) || body.length === 0) return null;

    const hit = body[0] as Record<string, unknown>;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { label: typeof hit.display_name === "string" ? hit.display_name : query, lat, lng };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/geocode.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Add the route**

Create `app/api/geocode/route.ts`:

```ts
import { NextResponse } from "next/server";
import { geocode } from "@/lib/geocode";

/** POST /api/geocode  { query }  ->  { area: Area | null } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  if (typeof body?.query !== "string" || body.query.trim() === "") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  return NextResponse.json({ area: await geocode(body.query) });
}
```

- [ ] **Step 6: Add the area card**

In `app/cards.tsx`, add this case to the `switch` in `CardView`, immediately before `case "fault":`

```tsx
    case "area": {
      const d = 0.035;
      const bbox = [card.lng - d, card.lat - d, card.lng + d, card.lat + d].join("%2C");
      return (
        <Shell label="Is this the right area?">
          <iframe
            title={`Map of ${card.area}`}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${card.lat}%2C${card.lng}`}
            className="h-56 w-full rounded-md border border-line"
            loading="lazy"
          />
          <button
            type="button"
            onClick={() => onChoose(card.id, 0)}
            aria-pressed={card.confirmed}
            className={`self-start rounded-md border px-4 py-2 text-sm transition-colors ${
              card.confirmed
                ? "border-lamp bg-lamp/10 text-lamp"
                : "border-line hover:border-lamp/60"
            }`}
          >
            {card.confirmed ? `${card.area} — confirmed` : `Yes, ${card.area}`}
          </button>
        </Shell>
      );
    }
```

- [ ] **Step 7: Add the tool**

In `app/canvas.tsx`, add after the `confirm_business` registration:

```tsx
  useConversationClientTool("resolve_area", async ({ locality }: { locality: string }) => {
    try {
      const { area } = await post<{ area: { label: string; lat: number; lng: number } | null }>(
        "/api/geocode",
        { query: locality },
      );
      if (!area) return `couldn't place ${locality} on a map — just use it as typed and carry on`;

      dispatch({
        type: "add",
        card: { id: id(), kind: "area", area: locality, lat: area.lat, lng: area.lng, confirmed: false },
      });
      return `showing ${area.label} on screen — ask them to tap it if that's the right area`;
    } catch {
      // A map is a nicety. Losing it must not stop the visitor getting a table.
      return `couldn't place ${locality} on a map — just use it as typed and carry on`;
    }
  });
```

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

```bash
git add lib/geocode.ts lib/geocode.test.ts app/api/geocode/route.ts app/cards.tsx app/canvas.tsx
git commit -m "Confirm the area on a map before paying the scrape latency"
```

---

### Task 6: Restaurant search and grid

**Files:**
- Modify: `app/cards.tsx`
- Modify: `app/canvas.tsx`

**Interfaces:**
- Consumes: `POST /api/places` (Task 3), `PlaceRow` and `Shell` (Task 4), `latest` (Task 4).
- Produces: the `restaurants` card kind rendered; `search_restaurants` registered.

- [ ] **Step 1: Add the restaurants case to the renderer**

In `app/cards.tsx`, add to the `switch` in `CardView`, immediately before `case "fault":`

```tsx
    case "restaurants":
      return (
        <Shell label={`${card.places.length} places`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {card.places.map((place, i) => (
              <PlaceRow
                key={place.name + i}
                place={place}
                selected={card.chosen === i}
                onClick={() => onChoose(card.id, i)}
              />
            ))}
          </div>
        </Shell>
      );
```

- [ ] **Step 2: Add the tool**

In `app/canvas.tsx`, after `resolve_area`:

```tsx
  useConversationClientTool(
    "search_restaurants",
    async ({ cuisine, area }: { cuisine: string; area: string }) => {
      try {
        const { places } = await post<{ places: Place[] }>("/api/places", {
          query: `${cuisine} restaurant`,
          area,
          limit: 6,
        });
        if (places.length === 0) return `nothing came back for ${cuisine} in ${area} — offer another area`;

        dispatch({ type: "add", card: { id: id(), kind: "restaurants", places, chosen: null } });

        const top = places
          .slice(0, 3)
          .map((p) => `${p.name}${p.rating !== null ? ` at ${p.rating} stars` : ""}`)
          .join(", ");
        return `${places.length} ${cuisine} places in ${area}. Top three: ${top}. Name those three out loud and ask which one they want.`;
      } catch (error) {
        fault(error instanceof Error ? error.message : "the search failed");
        return "the search failed — tell them and offer to try a different area";
      }
    },
  );
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

```bash
git add app/cards.tsx app/canvas.tsx
git commit -m "Search restaurants by cuisine and area, render them as a grid"
```

---

### Task 7: The booking guardrail

Pure validation, tested hard, before anything can dial. This task ships no UI on purpose — it is the security boundary and deserves its own review gate.

**Files:**
- Create: `lib/booking.ts`
- Create: `lib/booking.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BookingRequest`, `validateBooking(input: unknown): BookingRequest` (throws `Error` with a caller-safe message), `placeBookingCall(req: BookingRequest, signal?: AbortSignal): Promise<{ conversationId: string; callSid: string | null }>`, `callStatus(conversationId: string): Promise<{ status: string; transcript: { role: string; message: string }[] }>`.

- [ ] **Step 1: Write the failing test**

Create `lib/booking.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callStatus, placeBookingCall, validateBooking } from "./booking";

const good = {
  restaurant_name: "Qamar Table",
  to_number: "+97141234567",
  party_size: 4,
  when: "tomorrow at eight",
  customer_name: "Shameer",
  customer_phone: "+971501112233",
};

describe("validateBooking", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("DEMO_BOOKING_NUMBERS", "+97141234567, +971509998877");
  });

  it("accepts a well-formed booking to an allowlisted number", () => {
    expect(validateBooking(good)).toEqual(good);
  });

  it("rejects a number that is not on the allowlist", () => {
    expect(() => validateBooking({ ...good, to_number: "+15551234567" })).toThrow(
      "not an approved demo number",
    );
  });

  it("rejects when the allowlist is unset, rather than allowing everything", () => {
    vi.stubEnv("DEMO_BOOKING_NUMBERS", "");
    expect(() => validateBooking(good)).toThrow("not an approved demo number");
  });

  it("ignores whitespace and formatting when matching the allowlist", () => {
    expect(validateBooking({ ...good, to_number: "+971 4 123 4567" }).to_number).toBe("+97141234567");
  });

  it("rejects a party size outside 1..20", () => {
    expect(() => validateBooking({ ...good, party_size: 0 })).toThrow();
    expect(() => validateBooking({ ...good, party_size: 21 })).toThrow();
  });

  it("rejects a customer phone that is not E.164", () => {
    expect(() => validateBooking({ ...good, customer_phone: "call me" })).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => validateBooking({ to_number: "+97141234567" })).toThrow();
  });
});

describe("placeBookingCall", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-test");
    vi.stubEnv("ELEVENLABS_BOOKER_AGENT_ID", "agent_booker");
    vi.stubEnv("ELEVENLABS_AGENT_PHONE_NUMBER_ID", "phnum_1");
    vi.restoreAllMocks();
  });

  it("sends the booking details as dynamic variables and returns the ids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, conversation_id: "conv_9", callSid: "CA1" }), {
        status: 200,
      }),
    );

    await expect(placeBookingCall(good)).resolves.toEqual({
      conversationId: "conv_9",
      callSid: "CA1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/convai/twilio/outbound-call");
    const sent = JSON.parse(String(init?.body));
    expect(sent).toMatchObject({
      agent_id: "agent_booker",
      agent_phone_number_id: "phnum_1",
      to_number: "+97141234567",
    });
    expect(sent.conversation_initiation_client_data.dynamic_variables).toEqual({
      restaurant_name: "Qamar Table",
      party_size: "4",
      when: "tomorrow at eight",
      customer_name: "Shameer",
      customer_phone: "+971501112233",
    });
  });

  it("throws when ElevenLabs rejects the call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 422 }));
    await expect(placeBookingCall(good)).rejects.toThrow("outbound call failed");
  });
});

describe("callStatus", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-test");
    vi.restoreAllMocks();
  });

  it("flattens the conversation into status plus transcript turns", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "done",
          transcript: [
            { role: "agent", message: "Table for four at eight, please." },
            { role: "user", message: "See you then." },
            { role: "agent", message: null },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(callStatus("conv_9")).resolves.toEqual({
      status: "done",
      transcript: [
        { role: "agent", message: "Table for four at eight, please." },
        { role: "user", message: "See you then." },
      ],
    });
  });

  it("reports in-progress rather than throwing when the conversation is not readable yet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    await expect(callStatus("conv_9")).resolves.toEqual({ status: "in-progress", transcript: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/booking.test.ts`
Expected: FAIL — `Failed to resolve import "./booking"`.

- [ ] **Step 3: Implement**

Create `lib/booking.ts`:

```ts
import { z } from "zod";

/**
 * The outbound booking call.
 *
 * The allowlist in validateBooking is the most important thing in this file.
 * These arguments come from a language model parsing speech from whoever is
 * holding the microphone on a public URL. Without the allowlist this endpoint
 * is a robodialer. It is checked server-side, before any outbound request.
 *
 * No twilio package: the Twilio credentials live inside the ElevenLabs
 * phone-number import, so the whole outbound leg is one authenticated fetch.
 */

const API = "https://api.elevenlabs.io/v1";

/** E.164, ignoring the spaces and dashes people and models put in numbers. */
const E164 = /^\+[1-9]\d{7,14}$/;

const digits = (value: string) => value.replace(/[^\d+]/g, "");

const BookingSchema = z.object({
  restaurant_name: z.string().min(1),
  to_number: z.string().transform(digits).refine((v) => E164.test(v), "not a phone number"),
  party_size: z.number().int().min(1).max(20),
  when: z.string().min(1),
  customer_name: z.string().min(1),
  customer_phone: z.string().transform(digits).refine((v) => E164.test(v), "not a phone number"),
});

export type BookingRequest = z.infer<typeof BookingSchema>;

/** Approved demo numbers. Empty or unset means nothing may be dialled. */
function allowlist(): string[] {
  return (process.env.DEMO_BOOKING_NUMBERS ?? "")
    .split(",")
    .map((n) => digits(n.trim()))
    .filter((n) => n !== "");
}

export function validateBooking(input: unknown): BookingRequest {
  const booking = BookingSchema.parse(input);

  if (!allowlist().includes(booking.to_number)) {
    throw new Error(`${booking.to_number} is not an approved demo number`);
  }
  return booking;
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is required");
  return key;
}

export async function placeBookingCall(
  booking: BookingRequest,
  signal?: AbortSignal,
): Promise<{ conversationId: string; callSid: string | null }> {
  const agentId = process.env.ELEVENLABS_BOOKER_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
  if (!agentId || !phoneNumberId) {
    throw new Error("ELEVENLABS_BOOKER_AGENT_ID and ELEVENLABS_AGENT_PHONE_NUMBER_ID are required");
  }

  const response = await fetch(`${API}/convai/twilio/outbound-call`, {
    method: "POST",
    signal,
    headers: { "xi-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: booking.to_number,
      // Same injection path the Fact Sheet uses (docs/adr/0002): the Booker
      // knows the whole booking before the phone starts ringing.
      conversation_initiation_client_data: {
        dynamic_variables: {
          restaurant_name: booking.restaurant_name,
          party_size: String(booking.party_size),
          when: booking.when,
          customer_name: booking.customer_name,
          customer_phone: booking.customer_phone,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`outbound call failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { conversation_id?: unknown; callSid?: unknown };
  if (typeof body.conversation_id !== "string") {
    throw new Error("outbound call failed: no conversation id came back");
  }
  return {
    conversationId: body.conversation_id,
    callSid: typeof body.callSid === "string" ? body.callSid : null,
  };
}

export async function callStatus(
  conversationId: string,
): Promise<{ status: string; transcript: { role: string; message: string }[] }> {
  const response = await fetch(`${API}/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": apiKey() },
  });

  // A conversation is not readable the instant the call is placed. That is a
  // ringing phone, not an error — the poller keeps asking.
  if (!response.ok) return { status: "in-progress", transcript: [] };

  const body = (await response.json()) as { status?: unknown; transcript?: unknown };
  const turns = Array.isArray(body.transcript) ? body.transcript : [];

  return {
    status: typeof body.status === "string" ? body.status : "in-progress",
    transcript: turns
      .map((turn) => turn as { role?: unknown; message?: unknown })
      .filter((turn) => typeof turn.role === "string" && typeof turn.message === "string")
      .map((turn) => ({ role: turn.role as string, message: turn.message as string })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/booking.test.ts`
Expected: 11 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/booking.ts lib/booking.test.ts
git commit -m "Add the booking allowlist guardrail and the outbound call client"
```

---

### Task 8: Use case B — place the call and watch it happen

End of this task, use case B works end to end.

**Files:**
- Create: `app/api/book/route.ts`
- Modify: `app/cards.tsx`
- Modify: `app/canvas.tsx`

**Interfaces:**
- Consumes: `validateBooking`, `placeBookingCall`, `callStatus` (Task 7); `latest`, `post`, `fault` (Task 4).
- Produces: `POST /api/book` → `{ conversation_id: string }`; `GET /api/book?id=` → `{ status: string, transcript: {role,message}[] }`; the `call` card kind; `book_table` registered.

- [ ] **Step 1: Add the route**

Create `app/api/book/route.ts`:

```ts
import { NextResponse } from "next/server";
import { callStatus, placeBookingCall, validateBooking } from "@/lib/booking";

/**
 * POST /api/book  { restaurant_name, to_number, party_size, when,
 *                   customer_name, customer_phone }  ->  { conversation_id }
 * GET  /api/book?id=<conversation_id>  ->  { status, transcript }
 *
 * validateBooking runs first and throws on anything not on the allowlist.
 * Nothing dials before it passes.
 */

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  let booking;
  try {
    booking = validateBooking(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid booking";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { conversationId } = await placeBookingCall(booking);
    return NextResponse.json({ conversation_id: conversationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "the call failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  return NextResponse.json(await callStatus(id));
}
```

- [ ] **Step 2: Add the call card**

In `app/cards.tsx`, add to the `switch` in `CardView`, immediately before `case "fault":`

```tsx
    case "call":
      return (
        <Shell label={`Calling ${card.restaurant}`}>
          <p className="font-mono text-xs tracking-widest text-mute uppercase">
            <span
              className={`mr-2 inline-block size-2 rounded-full align-middle ${
                card.status === "done" ? "bg-lamp" : card.status === "failed" ? "bg-fault" : "lamp-live bg-lamp"
              }`}
              aria-hidden
            />
            {card.status}
          </p>
          {card.transcript.length === 0 ? (
            <p className="text-sm text-mute">ringing…</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {card.transcript.map((turn, i) => (
                <li key={i} className="text-sm">
                  <span className="font-mono text-[11px] tracking-widest text-mute uppercase">
                    {turn.role === "agent" ? "us" : "them"}
                  </span>
                  <p>{turn.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Shell>
      );
```

- [ ] **Step 3: Add the tool and the poller**

In `app/canvas.tsx`, add this constant near the top, below `const WIDGET`-style constants:

```tsx
// The booking call is the demo's closing shot — poll fast enough that the
// transcript reads as live, slow enough not to hammer the API.
const CALL_POLL_MS = 2000;
```

Then add after `search_restaurants`:

```tsx
  useConversationClientTool(
    "book_table",
    async (args: {
      index: number;
      party_size: number;
      when: string;
      customer_name: string;
      customer_phone: string;
    }) => {
      const grid = latest("restaurants");
      const place = grid?.places[args.index];
      if (!place) return "that wasn't one of the options — ask which one they meant";
      if (!place.phone) return `${place.name} didn't publish a phone number — offer another one`;

      dispatch({ type: "choose", id: grid.id, index: args.index });

      const cardId = id();
      try {
        const { conversation_id } = await post<{ conversation_id: string }>("/api/book", {
          restaurant_name: place.name,
          to_number: place.phone,
          party_size: args.party_size,
          when: args.when,
          customer_name: args.customer_name,
          customer_phone: args.customer_phone,
        });

        dispatch({
          type: "add",
          card: {
            id: cardId,
            kind: "call",
            restaurant: place.name,
            conversationId: conversation_id,
            status: "ringing",
            transcript: [],
          },
        });

        const poll = setInterval(async () => {
          try {
            const response = await fetch(`/api/book?id=${conversation_id}`);
            const state = (await response.json()) as {
              status: string;
              transcript: { role: string; message: string }[];
            };
            dispatch({ type: "call", id: cardId, status: state.status, transcript: state.transcript });
            if (state.status === "done" || state.status === "failed") clearInterval(poll);
          } catch {
            // A missed poll only delays the transcript; the next one catches up.
          }
        }, CALL_POLL_MS);

        return `calling ${place.name} now — tell them it's ringing and stay quiet until it's done`;
      } catch (error) {
        fault(error instanceof Error ? error.message : "the call failed");
        return "couldn't get the call out — tell them plainly and offer to try again";
      }
    },
  );
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Verify the guardrail by hand**

With the dev server running:

```bash
curl -s -X POST localhost:3000/api/book -H 'content-type: application/json' \
  -d '{"restaurant_name":"X","to_number":"+15551234567","party_size":2,"when":"tonight","customer_name":"A","customer_phone":"+971501112233"}'
```

Expected: HTTP 400, `{"error":"+15551234567 is not an approved demo number"}`. **No call is placed.** If a call goes out, stop and fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add app/api/book/route.ts app/cards.tsx app/canvas.tsx
git commit -m "Use case B: book a table by outbound call, transcript streaming in"
```

---

### Task 9: Prompts, environment, and the drift test

Everything that has to be true outside the code for the demo to run.

**Files:**
- Create: `prompts/concierge-prompt.md`
- Create: `prompts/booker-prompt.md`
- Create: `prompts/concierge.test.ts`
- Modify: `.env.example`
- Modify: `.claude/rules/frontend.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the five tool names registered in `app/canvas.tsx` (Tasks 4–8).
- Produces: nothing code-facing. The test guards name drift between prompt and code.

- [ ] **Step 1: Write the Concierge prompt**

Create `prompts/concierge-prompt.md`. Paste the block into the Concierge agent's system prompt field, and register each tool below as a **client tool** with exactly these parameter names.

````markdown
# Concierge agent — system prompt

Owner: Taha (Voice). Five client tools, registered in `app/canvas.tsx`. The names
here must match that file exactly — `prompts/concierge.test.ts` fails if they drift.

**First message:**

```
What are we looking for?
```

## Tools

| Tool | Parameters |
|---|---|
| `find_business` | `name` (string), `locality` (string, optional) |
| `confirm_business` | `index` (number, 0-based) |
| `resolve_area` | `locality` (string) |
| `search_restaurants` | `cuisine` (string), `area` (string) |
| `book_table` | `index` (number), `party_size` (number), `when` (string), `customer_name` (string), `customer_phone` (string) |

## System prompt

```
You help someone find a business or book a table. You are speaking out loud.

Everything on the screen is put there by you, through your tools. When you call
a tool, say what you are doing first — "let me find them" — because silence
sounds like a dropped call. Some of these tools take up to a minute. Say so.

## Finding a business

Caller names a business: call find_business with the name, and the area if they
gave one. Read back the top match and ask if that is the one. When they confirm,
by voice or by tapping the screen, call confirm_business with its index.

After confirm_business you have read their website. From that point you answer
only from what it returned. You do not know their prices, hours, or services
beyond that. If it is not there, say so and offer to look at another business.
Never estimate a price. Never say "typically" or "usually" about them.

## Booking a table

Caller wants a restaurant: get the cuisine and the area. Call resolve_area with
the area first and ask them to confirm what appears on screen. Only after they
confirm, call search_restaurants.

Name the top three out loud. Never read the whole list.

When they pick one, you need four things before you can call book_table: how
many people, when, their name, and their phone number. Ask for whatever is
missing, one question at a time. Read the phone number back once.

Then call book_table. Tell them it is ringing, and stay quiet while it runs.
When it finishes, tell them what happened.

## When something fails

Every tool tells you what to say when it fails. Say that, plainly, and offer the
next thing. A failure you name honestly costs nothing. A guess costs everything.

## How to talk

One or two sentences. Warm and quick. No corporate filler.

Answer in whatever language they use — English, Arabic, Hindi, Tagalog. If they
switch mid-conversation, switch with them and do not comment on it.

If they interrupt, stop immediately and listen.

If asked whether you are a person, say you are an AI assistant and carry on.
```
````

- [ ] **Step 2: Write the Booker prompt**

Create `prompts/booker-prompt.md`:

````markdown
# Booker agent — system prompt

Owner: Taha (Voice). This agent makes the outbound call. Every double-brace
placeholder arrives through `conversation_initiation_client_data.dynamic_variables`
in `lib/booking.ts` — the names must match that object exactly.

Attach this agent to the imported Twilio number and set `ELEVENLABS_BOOKER_AGENT_ID`
and `ELEVENLABS_AGENT_PHONE_NUMBER_ID` to match.

**First message:**

```
Hi — I'm calling to book a table, is now a good time?
```

## System prompt

```
You are calling {{restaurant_name}} to book a table on behalf of a customer.
You are the one who called them. They did not call you.

The booking:
- Party of {{party_size}}
- {{when}}
- Under the name {{customer_name}}
- Callback number {{customer_phone}}

Ask for the table. If that exact time is not available, ask what is close and
accept anything within an hour either side. Anything further out, say you will
check with the customer and let them go.

Give the name and callback number when they ask for it, and not before.

Before you hang up, say the booking back once: the party size, the time, and the
name. Then thank them and end the call.

Keep it short. You are one call in a busy restaurant's evening.

If you reach a voicemail, do not leave the customer's phone number. Say you will
call back, and end the call.

If asked whether you are a person, say you are an AI assistant calling on behalf
of a customer, and carry on.
```
````

- [ ] **Step 3: Write the drift test**

Create `prompts/concierge.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The prompt names the tools; canvas.tsx registers them. Nothing at runtime
 * catches a mismatch — the agent just calls a tool that is not there and the
 * conversation dead-ends. This test is that catch.
 */

const prompt = readFileSync(new URL("./concierge-prompt.md", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../app/canvas.tsx", import.meta.url), "utf8");

const TOOLS = [
  "find_business",
  "confirm_business",
  "resolve_area",
  "search_restaurants",
  "book_table",
];

describe("concierge prompt", () => {
  it.each(TOOLS)("names %s, and canvas.tsx registers it", (tool) => {
    expect(prompt).toContain(tool);
    expect(canvas).toContain(`"${tool}"`);
  });

  it("registers no tool the prompt does not mention", () => {
    const registered = [...canvas.matchAll(/useConversationClientTool\(\s*"([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect(registered.sort()).toEqual([...TOOLS].sort());
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run prompts/concierge.test.ts`
Expected: 6 passing. The second test is the one that actually guards drift — it fails if `canvas.tsx` registers a tool the prompt never mentions, or drops one it does.

- [ ] **Step 5: Add the new environment variables**

Append to `.env.example`:

```
# Apify — Google Maps place search, both canvas flows
APIFY_TOKEN=

# ElevenLabs — the Concierge agent that runs the canvas at /
NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID=

# ElevenLabs — the Booker agent that places the outbound booking call,
# and the Twilio number imported into ElevenLabs that it calls from.
ELEVENLABS_BOOKER_AGENT_ID=
ELEVENLABS_AGENT_PHONE_NUMBER_ID=

# The only numbers /api/book may dial. Comma-separated, E.164.
# Empty means nothing may be dialled — that is deliberate, not a bug.
DEMO_BOOKING_NUMBERS=
```

- [ ] **Step 6: Correct the frontend rules file**

Replace the first two bullets of `.claude/rules/frontend.md`:

```markdown
# Frontend Rules

- Functional components + hooks only
- Plain Tailwind v4 with the tokens in app/globals.css. No component library.
- Tailwind CSS, dark mode first
- Local state via useState/useReducer. No global store — this is a one-page app.
- cn() for conditional classes
- next/image for all images
```

- [ ] **Step 7: Document the canvas in the README**

Add a section to `README.md` after the existing architecture section:

```markdown
## The voice canvas

`/` is a voice canvas: the visitor talks, and a Concierge agent paints the page
through client tools. `/console` is the original Dial receptionist.

Two flows: **find a business** (search → confirm → crawl → Fact Sheet) and
**book a table** (confirm area → scrape restaurants → pick → outbound call).

The outbound call goes to the Dial agent at `/console`, primed with the demo
restaurant's Fact Sheet. Our booking bot books a table with our receptionist.

`/api/book` will only dial numbers listed in `DEMO_BOOKING_NUMBERS`. Design
doc: `docs/superpowers/specs/2026-08-08-voice-canvas-design.md`.
```

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

```bash
git add prompts/ .env.example .claude/rules/frontend.md README.md
git commit -m "Add the Concierge and Booker prompts, env vars, and the tool-name drift test"
```

---

### Task 10: Stage hardening

Cache and pre-warm so the Apify latency cannot kill the demo. Cut this task first if time runs out — everything above works without it.

**Files:**
- Create: `supabase/migrations/0002_places.sql`
- Modify: `lib/supabase.ts`
- Modify: `app/api/places/route.ts`
- Create: `scripts/prewarm.mts`

**Interfaces:**
- Consumes: `Place` (Task 3), `db()` (existing, private to `lib/supabase.ts`).
- Produces: `getCachedPlaces(key: string): Promise<Place[] | null>`, `cachePlaces(key: string, places: Place[]): Promise<void>`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_places.sql`:

```sql
-- Same shape and same purpose as factsheets: the demo survives venue wifi and
-- a re-run is instant. Nothing else goes in here.
create table if not exists places (
  key         text primary key,   -- lower("<query>|<area>")
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);
```

- [ ] **Step 2: Add the cache functions**

Append to `lib/supabase.ts`. Add `Place` to the imports at the top:

```ts
import type { Place } from "./places";
```

Add `places` to the `Database["public"]["Tables"]` object, alongside `factsheets`:

```ts
      places: {
        Row: { key: string; data: Place[]; fetched_at: string };
        Insert: { key: string; data: Place[]; fetched_at?: string };
        Update: Partial<{ key: string; data: Place[]; fetched_at: string }>;
        Relationships: [];
      };
```

Then append:

```ts
/** Cache key for a place search. Case- and whitespace-insensitive. */
export function placesKey(query: string, area?: string): string {
  return `${query.trim()}|${area?.trim() ?? ""}`.toLowerCase().replace(/\s+/g, " ");
}

/** Cached places for a search, or null. Never throws — a miss is not an error. */
export async function getCachedPlaces(key: string): Promise<Place[] | null> {
  const { data } = await db().from("places").select("data").eq("key", key).maybeSingle();
  return Array.isArray(data?.data) && data.data.length > 0 ? data.data : null;
}

export async function cachePlaces(key: string, places: Place[]): Promise<void> {
  const { error } = await db().from("places").upsert({ key, data: places });
  if (error) throw new Error(`places cache write failed: ${error.message}`);
}
```

- [ ] **Step 3: Read through the cache in the route**

In `app/api/places/route.ts`, change the import line and the `try` block:

```ts
import { cachePlaces, getCachedPlaces, placesKey } from "@/lib/supabase";
```

```ts
  const key = placesKey(body.query, typeof body.area === "string" ? body.area : undefined);

  // A cache hit is the demo path. A miss must still work, and must still be
  // narrated by the agent — a cold search runs 20-90s.
  const cached = await getCachedPlaces(key).catch(() => null);
  if (cached) return NextResponse.json({ places: cached });

  try {
    const places = await searchPlaces(body.query, {
      area: typeof body.area === "string" ? body.area : undefined,
      limit,
    });
    // A cache write failure must not take down a search that succeeded.
    await cachePlaces(key, places).catch((error: unknown) => {
      console.warn(`places cache write skipped: ${error instanceof Error ? error.message : error}`);
    });
    return NextResponse.json({ places });
  } catch (error) {
```

- [ ] **Step 4: Add the pre-warm script**

Create `scripts/prewarm.mts`:

```ts
/**
 * Run before the pitch, on venue wifi, against the deployed URL:
 *   node scripts/prewarm.mts https://dial.vercel.app
 *
 * Fills the places cache so every demo query answers instantly.
 */

const base = process.argv[2] ?? "http://localhost:3000";

const QUERIES: { query: string; area?: string }[] = [
  { query: "Qamar Table", area: "Jumeirah Lake Towers Dubai" },
  { query: "Ruwaya Hair Studio", area: "Al Wasl Road Dubai" },
  { query: "Meridian Dental Rooms", area: "Jumeirah 1 Dubai" },
  { query: "Lebanese restaurant", area: "Jumeirah Lake Towers Dubai" },
  { query: "Middle Eastern restaurant", area: "Downtown Dubai" },
];

for (const { query, area } of QUERIES) {
  const started = Date.now();
  const response = await fetch(`${base}/api/places`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, area, limit: 6 }),
  });
  const body = (await response.json()) as { places?: unknown[]; error?: string };
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `${response.ok ? "ok " : "FAIL"} ${seconds}s  ${query} / ${area ?? "-"}  ${
      body.error ?? `${body.places?.length ?? 0} places`
    }`,
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

Then apply the migration in the Supabase SQL editor and run:

```bash
npm run dev &
node scripts/prewarm.mts http://localhost:3000
```

Expected: every line `ok`, first run slow, second run under a second.

```bash
git add supabase/migrations/0002_places.sql lib/supabase.ts app/api/places/route.ts scripts/prewarm.mts
git commit -m "Cache and pre-warm place searches so venue wifi can't kill the demo"
```

---

## Manual setup outside the code

None of this is committable. Do it before Task 4's hand-verification.

1. **ElevenLabs → Agents → new agent "Concierge".** Paste `prompts/concierge-prompt.md`. Add the five tools as **client tools** with exactly the parameter names in that file. Copy its ID to `NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID`.
2. **ElevenLabs → Agents → new agent "Booker".** Paste `prompts/booker-prompt.md`. Copy its ID to `ELEVENLABS_BOOKER_AGENT_ID`.
3. **Twilio:** buy a number. **ElevenLabs → Phone numbers → import** it with the Twilio SID and auth token. Copy the returned phone number ID to `ELEVENLABS_AGENT_PHONE_NUMBER_ID`.
4. **The number that gets called:** a second phone you control. Put it in `DEMO_BOOKING_NUMBERS` in E.164. Point the existing Dial agent at it (or have a teammate answer). Nothing else may go in this list.
5. **Apify:** account → Settings → API token → `APIFY_TOKEN`.
6. **Supabase:** run `supabase/migrations/0002_places.sql` (Task 10 only).

## Cut order

If the clock runs out, cut from the bottom: Task 10, then Task 9's README, then Tasks 8–7 (booking), then Tasks 6–5 (restaurants). **Tasks 1–4 are the floor** — they are use case A, and they are shippable alone.
