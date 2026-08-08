"use client";

import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import { useCallback, useReducer, useRef, useState } from "react";
import { canvasReducer, type Card } from "@/lib/canvas";
import { FactSheetSchema } from "@/lib/factsheet";
import type { LiveRead } from "@/lib/liveread";
import type { Place } from "@/lib/places";
import { CardView } from "./cards";
import { Orb } from "./orb";

/**
 * The voice canvas. The visitor talks; the agent paints cards through client
 * tools. Taps travel back as contextual updates, never as tool return values —
 * a tool that waits on a human hangs the conversation.
 *
 * useConversation and useConversationClientTool both resolve against the
 * nearest ConversationProvider, so the provider has to sit above the component
 * that registers the tools — hence the split at the bottom of this file.
 */

// The booking call is the demo's closing shot — poll fast enough that the
// transcript reads as live, slow enough not to hammer the API.
const CALL_POLL_MS = 2000;

/**
 * A voice interface tells you nothing about what it can do. These are the two
 * shapes of request the agent handles, said the way you would say them.
 */
const OPENERS = [
  "Tell me about Ruwaya Hair Studio",
  "Find Lebanese food in Jumeirah Lake Towers",
];

/**
 * Tool arguments arrive as an untyped bag: a language model produced them from
 * speech, so the SDK types them Record<string, unknown> and it is right to.
 * Read them through these two helpers and guard the result — anything that
 * actually matters is re-validated server-side (lib/ring.ts).
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
  const [starting, setStarting] = useState(false);
  const [cards, dispatch] = useReducer(canvasReducer, [] as Card[]);

  // Tools need to read the latest cards without re-registering on every paint.
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;

  // An opener tapped before the line is up, sent the moment it connects.
  const opener = useRef<string | null>(null);
  const send = useRef<((text: string) => void) | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      setLive(true);
      setStarting(false);
      if (opener.current) {
        send.current?.(opener.current);
        opener.current = null;
      }
    },
    onDisconnect: () => {
      setLive(false);
      setStarting(false);
    },
    onError: () => setStarting(false),
  });
  send.current = conversation.sendUserMessage;

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

  /**
   * The place the conversation is currently about: whatever the visitor last
   * picked, from either grid. The agent can override with an index.
   */
  const inFocus = useCallback(
    (override: number) => {
      for (let i = cardsRef.current.length - 1; i >= 0; i--) {
        const card = cardsRef.current[i];
        if (card?.kind !== "restaurants" && card?.kind !== "candidates") continue;
        const pick = override >= 0 ? override : (card.chosen ?? 0);
        return card.places[pick] ?? null;
      }
      return null;
    },
    [],
  );

  useConversationClientTool("check_live", async (args) => {
    const place = inFocus(index(args, "index"));
    if (!place) return "nothing is on screen yet — search for somewhere first";
    if (!place.google_url) return `no listing to read for ${place.name} — say so`;

    try {
      const read = await post<LiveRead>("/api/liveread", {
        name: place.name,
        google_url: place.google_url,
      });

      dispatch({
        type: "add",
        card: { id: id(), kind: "liveread", read, reviews: place.reviews, tags: place.review_tags },
      });

      // Say the freshness out loud — a rating without a timestamp is just a
      // number the agent could have made up.
      return `just read ${place.name}'s listing: rated ${read.rating ?? "unrated"}${
        place.reviews ? ` from ${place.reviews} reviews` : ""
      }${read.open_now ? `, and it says ${read.open_now}` : ""}. Say that you checked it just now.`;
    } catch (error) {
      fault(error instanceof Error ? error.message : "the live read failed");
      return "couldn't read their listing just now — say so and offer what you already know";
    }
  });

  useConversationClientTool("book_table", async (args) => {
    const pick = index(args, "index");
    const grid = latest("restaurants");
    const place = grid?.places[pick];
    if (!grid || !place) return "that wasn't one of the options — ask which one they meant";

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
      // Every call goes here. There is no Twilio: /api/ring rings the phone at
      // /phone, and a human answers it as the restaurant. See lib/ring.ts.
      const { call_id } = await post<{ call_id: string }>("/api/ring", {
        restaurant_name: place.name,
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
          conversationId: call_id,
          status: "ringing",
          transcript: [],
        },
      });

      const poll = setInterval(async () => {
        try {
          const response = await fetch(`/api/ring?id=${call_id}`);
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

  const start = useCallback(
    async (seed?: string) => {
      if (live || starting) {
        if (seed) conversation.sendUserMessage(seed);
        return;
      }
      opener.current = seed ?? null;
      setStarting(true);
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        conversation.startSession({ agentId, connectionType: "webrtc" });
      } catch {
        setStarting(false);
        fault("The microphone was blocked. Allow it in your browser and try again.");
      }
    },
    [agentId, conversation, fault, live, starting],
  );

  const open = live || cards.length > 0;
  const speaking = conversation.isSpeaking;

  return (
    <>
      <div className="aurora" aria-hidden>
        <span className="aurora-1" />
        <span className="aurora-2" />
        <span className="aurora-3" />
      </div>

      <main
        className={`mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-6 py-10 ${
          open ? "pb-40" : "pb-10"
        }`}
      >
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Dial</h1>
          <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-mute uppercase">
            <span
              className={`size-2 rounded-full transition-colors ${
                starting
                  ? "lamp-live bg-mute"
                  : speaking
                    ? "bg-lamp"
                    : live
                      ? "lamp-live bg-signal"
                      : "bg-line"
              }`}
              aria-hidden
            />
            {starting ? "opening the line" : speaking ? "speaking" : live ? "listening" : "line idle"}
          </div>
        </header>

        {!open && (
          <section className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
            <Orb
              live={live}
              speaking={speaking}
              docked={false}
              getInputVolume={conversation.getInputVolume}
              getOutputVolume={conversation.getOutputVolume}
            />

            <div className="flex flex-col gap-3">
              <h2 className="font-display text-4xl leading-tight font-semibold sm:text-5xl">
                Say the name.
                <br />
                It makes the call.
              </h2>
              <p className="mx-auto max-w-md text-balance text-mute">
                Dial finds the business, reads their website, and phones them for
                you — in whatever language you speak.
              </p>
            </div>

            <button
              type="button"
              onClick={() => start()}
              disabled={starting}
              className="rounded-full bg-lamp px-7 py-3.5 text-sm font-semibold text-ink transition-all hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-lamp focus-visible:ring-offset-2 focus-visible:ring-offset-ink focus-visible:outline-none disabled:opacity-50"
            >
              {starting ? "Opening the line…" : "Start talking"}
            </button>

            <div className="flex flex-col items-center gap-2">
              <p className="font-mono text-[11px] tracking-widest text-mute/70 uppercase">or try</p>
              <div className="flex flex-wrap justify-center gap-2">
                {OPENERS.map((line) => (
                  <button
                    key={line}
                    type="button"
                    onClick={() => start(line)}
                    disabled={starting}
                    className="rounded-full border border-line bg-panel/60 px-4 py-2 text-xs text-mute transition-colors hover:border-signal/60 hover:text-fg focus-visible:border-signal focus-visible:outline-none disabled:opacity-50"
                  >
                    “{line}”
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {open && cards.length === 0 && (
          <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="font-display text-2xl">The line is open.</p>
            <p className="max-w-xs text-balance text-mute">
              Say who you’re looking for, or what you want booked.
            </p>
          </section>
        )}

        {cards.length > 0 && (
          <div className="flex flex-col gap-6">
            {cards.map((card) => (
              <div key={card.id} className="card-in">
                <CardView card={card} onChoose={onChoose} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* The orb stays on screen for the whole conversation — it is the agent,
          and it is the only thing that tells you it heard you. */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-ink via-ink/90 to-transparent pt-10 pb-6">
          <div className="flex items-center gap-4 rounded-full border border-line bg-panel/80 py-2 pr-5 pl-2 backdrop-blur">
            <Orb
              live={live}
              speaking={speaking}
              docked
              getInputVolume={conversation.getInputVolume}
              getOutputVolume={conversation.getOutputVolume}
            />
            <div className="flex flex-col gap-0.5 text-left">
              <span className="font-mono text-[11px] tracking-widest text-mute uppercase">
                {speaking ? "speaking" : live ? "listening" : "line closed"}
              </span>
              {live ? (
                <button
                  type="button"
                  onClick={() => conversation.endSession()}
                  className="text-left text-xs text-mute underline decoration-line underline-offset-4 transition-colors hover:text-fault"
                >
                  Hang up
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => start()}
                  className="text-left text-xs text-lamp underline decoration-lamp/40 underline-offset-4"
                >
                  Call again
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
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
