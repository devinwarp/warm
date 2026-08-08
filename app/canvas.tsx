"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useCallback, useState } from "react";

/**
 * The voice canvas. The visitor talks; the agent paints cards through client
 * tools. Taps travel back as contextual updates, never as tool return values —
 * a tool that waits on a human hangs the conversation.
 *
 * useConversation and useConversationClientTool both resolve against the
 * nearest ConversationProvider, so the provider has to sit above the component
 * that registers the tools — hence the split.
 */

function CanvasInner({ agentId }: { agentId: string }) {
  const [live, setLive] = useState(false);
  const conversation = useConversation({
    onConnect: () => setLive(true),
    onDisconnect: () => setLive(false),
  });

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
