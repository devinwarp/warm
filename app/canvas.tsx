"use client";

import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import { useCallback, useReducer, useRef, useState } from "react";
import { canvasReducer, type Card } from "@/lib/canvas";
import { FactSheetSchema } from "@/lib/factsheet";
import type { Place } from "@/lib/places";
import { CardView } from "./cards";

/**
 * The voice canvas. The visitor talks; the agent paints cards through client
 * tools. Taps travel back as contextual updates, never as tool return values —
 * a tool that waits on a human hangs the conversation.
 *
 * useConversation and useConversationClientTool both resolve against the
 * nearest ConversationProvider, so the provider has to sit above the component
 * that registers the tools — hence the split at the bottom of this file.
 */

/**
 * Tool arguments arrive as an untyped bag: a language model produced them from
 * speech, so the SDK types them Record<string, unknown> and it is right to.
 * Read them through these two helpers and guard the result — anything that
 * actually matters is re-validated server-side (lib/booking.ts).
 */
function text(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

/** -1 when the model sent something that isn't an index. Never NaN. */
function index(args: Record<string, unknown>, key: string): number {
  const value = Number(args[key]);
  return Number.isInteger(value) && value >= 0 ? value : -1;
}

// The booking call is the demo's closing shot — poll fast enough that the
// transcript reads as live, slow enough not to hammer the API.
const CALL_POLL_MS = 2000;

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

function CanvasInner({ agentId }: { agentId: string }) {
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
      if (card?.kind === kind) return card as Extract<Card, { kind: K }>;
    }
    return null;
  }, []);

  useConversationClientTool("find_business", async (args) => {
    const name = text(args, "name");
    if (!name) return "didn't catch the business name — ask them to say it again";

    try {
      const { places } = await post<{ places: Place[] }>("/api/places", {
        query: name,
        area: text(args, "locality") || undefined,
        limit: 3,
      });
      const top = places[0];
      if (!top) return "no matches — ask them for a different name or area";

      dispatch({ type: "add", card: { id: id(), kind: "candidates", places, chosen: null } });

      return `found ${places.length} — top is ${top.name}, ${top.address}${
        top.website ? `, ${top.website}` : ", but no website to read"
      }. Ask them if that's the one.`;
    } catch (error) {
      fault(error instanceof Error ? error.message : "the search failed");
      return "the search failed — tell them and offer to try again";
    }
  });

  useConversationClientTool("confirm_business", async (args) => {
    const pick = index(args, "index");
    const candidates = latest("candidates");
    const place = candidates?.places[pick];
    if (!candidates || !place) return "that wasn't one of the options — ask them which one they meant";
    if (!place.website) return `${place.name} has no website to read — say so`;

    dispatch({ type: "choose", id: candidates.id, index: pick });

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

  useConversationClientTool("resolve_area", async (args) => {
    const locality = text(args, "locality");
    if (!locality) return "didn't catch the area — ask them where they're looking";

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

  useConversationClientTool("search_restaurants", async (args) => {
    const cuisine = text(args, "cuisine");
    const area = text(args, "area");
    if (!cuisine || !area) return "need both a cuisine and an area — ask for whichever is missing";

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
  });

  useConversationClientTool("book_table", async (args) => {
    const pick = index(args, "index");
    const grid = latest("restaurants");
    const place = grid?.places[pick];
    if (!grid || !place) return "that wasn't one of the options — ask which one they meant";
    if (!place.phone) return `${place.name} didn't publish a phone number — offer another one`;

    const partySize = Number(args.party_size);
    const when = text(args, "when");
    const customerName = text(args, "customer_name");
    const customerPhone = text(args, "customer_phone");
    if (!Number.isInteger(partySize) || !when || !customerName || !customerPhone) {
      return "still missing something — ask for the party size, the time, their name, and their number";
    }

    dispatch({ type: "choose", id: grid.id, index: pick });

    const cardId = id();
    try {
      const { conversation_id } = await post<{ conversation_id: string }>("/api/book", {
        restaurant_name: place.name,
        to_number: place.phone,
        party_size: partySize,
        when,
        customer_name: customerName,
        customer_phone: customerPhone,
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
      if (what) conversation.sendContextualUpdate(`The visitor tapped ${what} on screen.`);
    },
    [conversation],
  );

  const start = useCallback(async () => {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    conversation.startSession({ agentId, connectionType: "webrtc" });
  }, [agentId, conversation]);

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

export function Canvas({ agentId }: { agentId: string | null }) {
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
    <ConversationProvider>
      <CanvasInner agentId={agentId} />
    </ConversationProvider>
  );
}
