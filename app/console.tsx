"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FactSheetSchema, type FactSheet } from "@/lib/factsheet";
import { FactSheetCard } from "./factsheet-card";
import { Talk } from "./talk";

/**
 * The one page. Operator pastes a URL, watches the line come up, talks to it.
 *
 * Owner: Raja (Frontend).
 */

type Stage = "idle" | "reading" | "ready" | "fault";

type LogLine = { at: string; text: string; tone: "fg" | "mute" | "fault" };

const STAGE_LABEL: Record<Stage, string> = {
  idle: "line idle",
  reading: "reading the site",
  ready: "on the line",
  fault: "line fault",
};

function clock(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Console({ agentId }: { agentId: string | null }) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [sheet, setSheet] = useState<FactSheet | null>(null);
  const [lastRead, setLastRead] = useState<{ at: string; live: boolean } | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  const append = useCallback((text: string, tone: LogLine["tone"] = "fg") => {
    setLog((lines) => [...lines, { at: clock(), text, tone }]);
  }, []);

  useEffect(() => {
    if (stage !== "reading") return;
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [stage]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [log]);

  async function dial(event: React.FormEvent) {
    event.preventDefault();
    if (stage === "reading") return;

    let target: URL;
    try {
      target = new URL(url.includes("://") ? url : `https://${url}`);
    } catch {
      append("that is not a URL — paste the business's website address", "fault");
      return;
    }

    setStage("reading");
    setSheet(null);
    setLastRead(null);
    setElapsed(0);
    setLog([]);
    append(`dialling ${target.hostname}`);

    try {
      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target.toString() }),
      });

      // The crawl endpoint answers in one of two shapes: a plain FactSheet
      // JSON today, or NDJSON events once the backend streams page titles as
      // they land. Handle both so the log lights up the moment it can.
      const parsed = response.headers.get("content-type")?.includes("x-ndjson")
        ? await readEventStream(response, append)
        : await response.json();

      if (!response.ok) {
        throw new Error(
          typeof (parsed as { error?: unknown })?.error === "string"
            ? (parsed as { error: string }).error
            : `crawl failed (${response.status})`,
        );
      }

      const fresh = FactSheetSchema.parse(parsed);
      append(`fact sheet extracted — ${fresh.services.length} services, ${fresh.locations.length} locations`);
      append(`hours ${fresh.hours ? "published" : "not published"} · booking policy ${fresh.booking_policy ? "published" : "not published"}`, "mute");
      append("line ready — open it and talk");
      setSheet(fresh);
      setLastRead({ at: fresh.crawled_at, live: false });
      setStage("ready");
    } catch (error) {
      append(error instanceof Error ? error.message : "the crawl failed", "fault");
      setStage("fault");
    }
  }

  // While the caller is on the line, watch for the agent's mid-call lookups so
  // the "last read" stamp flips from the cached crawl time to just now.
  const onLiveRead = useCallback((fetchedAt: string) => {
    setLastRead((current) =>
      current?.at === fetchedAt ? current : { at: fetchedAt, live: true },
    );
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-6 py-14">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Dial</h1>
        <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-mute uppercase">
          <span
            className={`size-2 rounded-full ${
              stage === "reading"
                ? "lamp-live bg-lamp"
                : stage === "ready"
                  ? "bg-lamp"
                  : stage === "fault"
                    ? "bg-fault"
                    : "bg-line"
            }`}
            aria-hidden
          />
          {STAGE_LABEL[stage]}
          {stage === "reading" && ` · ${elapsed}s`}
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <p className="max-w-md text-mute">
          Paste a business URL. Sixty seconds later a line answers as that
          business, from what its site says right now.
        </p>
        <form onSubmit={dial} className="flex gap-2">
          <label htmlFor="url" className="sr-only">
            Business website URL
          </label>
          <input
            id="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="sereneskin.ae"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-4 py-3 font-mono text-sm placeholder:text-mute/60 focus-visible:border-lamp focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={stage === "reading" || url.trim() === ""}
            className="rounded-md bg-lamp px-5 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {stage === "reading" ? "Reading…" : "Dial"}
          </button>
        </form>
      </section>

      {log.length > 0 && (
        <section
          aria-label="Crawl log"
          className="max-h-48 overflow-y-auto rounded-md border border-line bg-panel/60 p-4 font-mono text-xs leading-6"
        >
          {log.map((line, i) => (
            <p
              key={i}
              className={
                line.tone === "fault" ? "text-fault" : line.tone === "mute" ? "text-mute" : ""
              }
            >
              <span className="mr-3 text-mute/60">{line.at}</span>
              {line.text}
            </p>
          ))}
          <div ref={logEnd} />
        </section>
      )}

      {sheet && lastRead && (
        <>
          <FactSheetCard sheet={sheet} lastRead={lastRead} />
          <Talk agentId={agentId} sheet={sheet} onLiveRead={onLiveRead} />
        </>
      )}
    </main>
  );
}

/** NDJSON events: {type:"page",title} logs a line, the last {type:"sheet"} wins. */
async function readEventStream(
  response: Response,
  append: (text: string, tone?: LogLine["tone"]) => void,
): Promise<unknown> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: unknown = null;
  let pages = 0;

  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { type: string; title?: string; sheet?: unknown; error?: string };
      if (event.type === "page") append(`read page ${++pages}: ${event.title || "untitled"}`, "mute");
      if (event.type === "sheet") result = event.sheet;
      if (event.type === "error") throw new Error(event.error ?? "the crawl failed");
    }
    if (done) return result;
  }
}
