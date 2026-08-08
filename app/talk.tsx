"use client";

import { useEffect, useState } from "react";
import { factsheetToVariables, type FactSheet } from "@/lib/factsheet";

/**
 * The ElevenLabs widget, opened on demand. The Fact Sheet goes in as dynamic
 * variables so the agent knows the business the moment the caller says hello —
 * no knowledge-base propagation wait (docs/adr/0002).
 */

const WIDGET_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";

// How often to ask the server whether the agent has re-read the site mid-call.
const LIVE_READ_POLL_MS = 4000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React.JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "agent-id": string;
          "dynamic-variables": string;
        },
        HTMLElement
      >;
    }
  }
}

export function Talk({
  agentId,
  sheet,
  onLiveRead,
}: {
  agentId: string | null;
  sheet: FactSheet;
  onLiveRead: (fetchedAt: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || document.querySelector(`script[src="${WIDGET_SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const poll = setInterval(async () => {
      try {
        const response = await fetch("/api/lookup");
        const body = (await response.json()) as { fetched_at?: string | null };
        if (body.fetched_at) onLiveRead(body.fetched_at);
      } catch {
        // A missed poll only delays the stamp; the next one catches up.
      }
    }, LIVE_READ_POLL_MS);
    return () => clearInterval(poll);
  }, [open, onLiveRead]);

  if (!agentId) {
    return (
      <p className="font-mono text-xs text-fault">
        NEXT_PUBLIC_ELEVENLABS_AGENT_ID is not set — the line can't open. See .env.example.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-lamp/60 px-5 py-3 text-sm font-semibold text-lamp transition-colors hover:bg-lamp hover:text-ink"
      >
        Open the line
      </button>
    );
  }

  return (
    <section aria-label="Voice line" className="flex flex-col gap-2">
      <p className="font-mono text-xs tracking-widest text-mute uppercase">
        line open — speak in any language
      </p>
      <elevenlabs-convai
        agent-id={agentId}
        dynamic-variables={JSON.stringify(factsheetToVariables(sheet))}
      />
    </section>
  );
}
