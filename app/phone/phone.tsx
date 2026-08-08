"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Turn } from "@/lib/ring";
import { Orb } from "../orb";

/**
 * The restaurant's end of the line.
 *
 * The Concierge doesn't dial a number — it posts to /api/ring, and this page
 * rings. Answer it and the Booker agent is on the other side over WebRTC, so
 * whoever is holding this screen plays the restaurant.
 *
 * Two things must happen before the phone can ring, and both need a user
 * gesture: an AudioContext for the ringtone, and microphone permission. That
 * is what "Take the desk" is for. Asking for either over a ringing phone is a
 * missed call.
 */

// The phone is idle almost all the time and answers within a beat when it
// isn't. A second of latency on an incoming call reads as a broken demo.
const POLL_MS = 1200;

const RING_CYCLE_MS = 2600;

type Screen = "off" | "idle" | "ringing" | "live" | "ended";

/** The ringtone, synthesised: nothing to load, nothing to cache, no autoplay fight. */
function burst(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Two plucked notes, twice — the cadence of a phone ringing, minus the shriek.
  for (const [i, offset] of [0, 0.34, 0.86, 1.2].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = i % 2 === 0 ? 659.25 : 987.77; // E5, B5
    const at = now + offset;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.4);
  }
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Handset({ hangUp = false }: { hangUp?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-7 ${hangUp ? "rotate-[135deg]" : ""}`}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.36 2.3.56 3.5.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.2.2 2.4.56 3.5a1 1 0 0 1-.24 1l-2.2 2.3Z" />
    </svg>
  );
}

function Mic({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-4.08A7 7 0 0 0 19 11h-2Z" />
      {off && <path d="M3.5 2.5 21 20l-1.4 1.4L2.1 3.9 3.5 2.5Z" />}
    </svg>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.2em] text-mute uppercase">{children}</p>
  );
}

/** What was said, newest at the bottom. Shown live, and again once it's over. */
function Feed({ turns, empty }: { turns: Turn[]; empty?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  return (
    <div ref={box} className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
      {turns.length === 0 && empty && <p className="mt-6 text-center text-sm text-mute">{empty}</p>}
      {turns.map((turn, i) => (
        <div
          key={i}
          className={`card-in max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
            turn.role === "agent"
              ? "self-start rounded-bl-sm border border-lamp/25 bg-lamp/10"
              : "self-end rounded-br-sm border border-line bg-panel"
          }`}
        >
          <span className="font-mono text-[10px] tracking-widest text-mute uppercase">
            {turn.role === "agent" ? "dial" : "you"}
          </span>
          <p className="mt-0.5">{turn.message}</p>
        </div>
      ))}
    </div>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/50 py-2 last:border-0">
      <span className="font-mono text-[11px] tracking-widest text-mute uppercase">{term}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

function PhoneInner({ agentId }: { agentId: string }) {
  const [screen, setScreen] = useState<Screen>("off");
  const [call, setCall] = useState<Call | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [time, setTime] = useState("");

  const audio = useRef<AudioContext | null>(null);

  // The conversation callbacks fire outside React's render, so they read the
  // call and the transcript through refs rather than stale closures.
  const turnsRef = useRef<Turn[]>([]);
  const callRef = useRef<Call | null>(null);
  callRef.current = call;

  const patch = useCallback(async (body: Record<string, unknown>) => {
    try {
      await fetch("/api/ring", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // The caller's card falls a beat behind. The call itself is unaffected.
    }
  }, []);

  const conversation = useConversation({
    micMuted: muted,
    onConnect: () => setScreen("live"),
    onMessage: ({ message, source }: { message: string; source: string }) => {
      turnsRef.current = [...turnsRef.current, { role: source === "user" ? "user" : "agent", message }];
      setTurns(turnsRef.current);
      const id = callRef.current?.id;
      if (id) void patch({ id, state: "live", transcript: turnsRef.current });
    },
    onDisconnect: () => {
      const id = callRef.current?.id;
      if (id) void patch({ id, state: "done", transcript: turnsRef.current });
      setScreen((s) => (s === "live" ? "ended" : s));
    },
    onError: () => {
      setFault("The line dropped before it connected.");
      setScreen((s) => (s === "live" ? "ended" : "idle"));
    },
  });

  // Wall clock in the status bar. Set after mount — the server has no idea
  // what time it is where the phone is.
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, []);

  // Waiting for a call. Only while idle: nothing should arrive mid-conversation.
  useEffect(() => {
    if (screen !== "idle") return;
    const poll = setInterval(async () => {
      try {
        const response = await fetch("/api/ring");
        const body = (await response.json()) as { call: Call | null };
        if (body.call?.state !== "ringing") return;
        turnsRef.current = [];
        setTurns([]);
        setFault(null);
        setCall(body.call);
        setScreen("ringing");
      } catch {
        // A missed poll delays the ring by one cycle. The next one catches it.
      }
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [screen]);

  useEffect(() => {
    if (screen !== "ringing") return;
    const ctx = audio.current;
    const ping = () => {
      if (ctx) burst(ctx);
      navigator.vibrate?.([420, 200, 420]);
    };
    ping();
    const loop = setInterval(ping, RING_CYCLE_MS);
    return () => {
      clearInterval(loop);
      navigator.vibrate?.(0);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== "live") return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [screen]);

  const takeTheDesk = useCallback(async () => {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      // Asked for now, used later. The stream itself is dropped immediately —
      // the SDK opens its own when the call connects.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      setFault(null);
      setScreen("idle");
    } catch {
      setFault("The microphone was blocked. Allow it in your browser and try again.");
    }
  }, []);

  const answer = useCallback(() => {
    if (!call) return;
    void patch({ id: call.id, state: "live" });
    conversation.startSession({
      agentId,
      connectionType: "webrtc",
      // The same injection the Twilio leg uses (docs/adr/0002): the Booker
      // knows the whole booking before you say hello.
      dynamicVariables: {
        restaurant_name: call.restaurant_name,
        party_size: String(call.party_size),
        when: call.when,
        customer_name: call.customer_name,
        customer_phone: call.customer_phone,
      },
    });
  }, [agentId, call, conversation, patch]);

  const decline = useCallback(() => {
    if (call) void patch({ id: call.id, state: "failed" });
    setCall(null);
    setScreen("idle");
  }, [call, patch]);

  const standby = useCallback(() => {
    setCall(null);
    setTurns([]);
    turnsRef.current = [];
    setScreen("idle");
  }, []);

  const ringing = screen === "ringing";
  const speaking = conversation.isSpeaking;

  return (
    <div className="phone" data-ringing={ringing}>
      <div className="phone-notch" aria-hidden />
      <div className="phone-screen">
        <header className="flex items-center justify-between px-7 pt-4 pb-2 font-mono text-[10px] tracking-[0.18em] text-mute uppercase">
          <span>{time || "—:—"}</span>
          <span className="flex items-center gap-2">
            <span
              className={`size-1.5 rounded-full ${
                screen === "live"
                  ? "lamp-live bg-signal"
                  : ringing
                    ? "lamp-live bg-lamp"
                    : screen === "off"
                      ? "bg-line"
                      : "bg-signal/50"
              }`}
              aria-hidden
            />
            Dial line
          </span>
        </header>

        {screen === "off" && (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 px-9 text-center">
            <div className="rounded-full border border-line bg-panel/60 p-5 text-mute">
              <Handset />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-3xl font-semibold">Front desk</h1>
              <p className="text-balance text-sm text-mute">
                This phone takes booking calls. Pick it up off the hook and it
                will ring when someone calls.
              </p>
            </div>
            <button
              type="button"
              onClick={takeTheDesk}
              className="rounded-full bg-lamp px-7 py-3.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-lamp focus-visible:outline-none"
            >
              Take the desk
            </button>
            <p className="font-mono text-[10px] tracking-widest text-mute/60 uppercase">
              needs the mic + the ringer
            </p>
          </section>
        )}

        {screen === "idle" && (
          <section className="flex flex-1 flex-col items-center justify-center gap-5 px-9 text-center">
            <div className="relative flex size-28 items-center justify-center">
              <span className="halo absolute inset-0 rounded-full border border-signal/30" aria-hidden />
              <span className="absolute inset-4 rounded-full bg-signal/5" aria-hidden />
              <span className="text-signal">
                <Handset />
              </span>
            </div>
            <h1 className="font-display text-2xl font-semibold">On the hook</h1>
            <p className="max-w-[16rem] text-balance text-sm text-mute">
              Waiting for a call. Ask the assistant on the other tab to book a
              table and this will ring.
            </p>
          </section>
        )}

        {ringing && call && (
          <section className="flex flex-1 flex-col items-center px-8 pt-6 text-center">
            <Label>incoming call</Label>

            <div className="my-auto flex flex-col items-center">
              <div className="relative flex size-32 items-center justify-center">
                <span className="halo absolute inset-0 rounded-full border border-lamp/50" aria-hidden />
                <span className="halo halo-2 absolute inset-0 rounded-full border border-lamp/40" aria-hidden />
                <span className="halo halo-3 absolute inset-0 rounded-full border border-lamp/30" aria-hidden />
                <span className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-lamp to-[#ef8f5a] font-display text-3xl font-semibold text-ink">
                  D
                </span>
              </div>

              <h1 className="mt-7 font-display text-4xl font-semibold tracking-tight">Dial</h1>
              <p className="mt-1.5 text-sm text-mute">
                Assistant calling for {call.customer_name}
              </p>
              <p className="mt-6 rounded-full border border-line bg-panel/60 px-4 py-1.5 font-mono text-[11px] tracking-widest text-mute uppercase">
                {call.restaurant_name}
              </p>
            </div>

            <div className="flex w-full items-start justify-between px-3 pb-10">
              <div className="flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  onClick={decline}
                  aria-label="Decline the call"
                  className="flex size-16 items-center justify-center rounded-full bg-fault text-ink transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-fault focus-visible:ring-offset-2 focus-visible:ring-offset-ink focus-visible:outline-none"
                >
                  <Handset hangUp />
                </button>
                <span className="font-mono text-[10px] tracking-widest text-mute uppercase">
                  decline
                </span>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  onClick={answer}
                  aria-label="Answer the call"
                  className="bob flex size-16 items-center justify-center rounded-full bg-signal text-ink shadow-[0_0_40px_-8px_var(--color-signal)] transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-ink focus-visible:outline-none"
                >
                  <Handset />
                </button>
                <span className="font-mono text-[10px] tracking-widest text-mute uppercase">
                  answer
                </span>
              </div>
            </div>
          </section>
        )}

        {screen === "live" && (
          <section className="flex min-h-0 flex-1 flex-col items-center px-6 pt-4">
            <Label>{speaking ? "they're speaking" : "they're listening"}</Label>
            <p className="mt-1 font-mono text-sm text-mute tabular-nums">{clock(seconds)}</p>

            <Orb
              live
              speaking={speaking}
              docked={false}
              getInputVolume={conversation.getInputVolume}
              getOutputVolume={conversation.getOutputVolume}
            />

            <Feed turns={turns} empty="Connected. They'll speak first." />

            <div className="flex items-center gap-5 py-6">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-pressed={muted}
                className={`flex size-12 items-center justify-center rounded-full border transition-colors focus-visible:outline-none ${
                  muted
                    ? "border-lamp bg-lamp/15 text-lamp"
                    : "border-line bg-panel text-mute hover:text-fg"
                }`}
              >
                <Mic off={muted} />
                <span className="sr-only">{muted ? "Unmute" : "Mute"}</span>
              </button>
              <button
                type="button"
                onClick={() => conversation.endSession()}
                aria-label="End the call"
                className="flex size-16 items-center justify-center rounded-full bg-fault text-ink transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-fault focus-visible:outline-none"
              >
                <Handset hangUp />
              </button>
            </div>
          </section>
        )}

        {screen === "ended" && (
          <section className="flex min-h-0 flex-1 flex-col px-7 pt-8">
            <Label>call ended · {clock(seconds)}</Label>
            <h1 className="mt-2 font-display text-3xl font-semibold">
              {call ? "What they asked for" : "Nothing came through"}
            </h1>

            {call && (
              <div className="mt-5 flex flex-col rounded-2xl border border-line bg-panel/70 px-5 py-2">
                <Detail term="party" value={`${call.party_size}`} />
                <Detail term="when" value={call.when} />
                <Detail term="name" value={call.customer_name} />
                <Detail term="callback" value={call.customer_phone} />
              </div>
            )}

            <Feed turns={turns} />

            <button
              type="button"
              onClick={standby}
              className="mb-9 self-center rounded-full border border-line bg-panel px-6 py-3 text-sm text-mute transition-colors hover:border-signal/60 hover:text-fg focus-visible:outline-none"
            >
              Back on the hook
            </button>
          </section>
        )}

        {fault && (
          <p className="px-7 pb-5 text-center font-mono text-[11px] text-fault">{fault}</p>
        )}
      </div>
    </div>
  );
}

export function Phone({ agentId }: { agentId: string | null }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="aurora" aria-hidden>
        <span className="aurora-1" />
        <span className="aurora-2" />
        <span className="aurora-3" />
      </div>

      {agentId ? (
        <ConversationProvider>
          <PhoneInner agentId={agentId} />
        </ConversationProvider>
      ) : (
        <p className="max-w-sm font-mono text-xs text-fault">
          ELEVENLABS_BOOKER_AGENT_ID is not set — nothing can answer. See
          .env.example.
        </p>
      )}
    </main>
  );
}
