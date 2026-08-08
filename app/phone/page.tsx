import type { Metadata } from "next";
import { Phone } from "./phone";

// Read the agent id per request, not at build. Otherwise adding the env var on
// Vercel does nothing until someone remembers to redeploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Front desk — Dial",
  description: "The restaurant's end of the line.",
};

/**
 * The other end of the booking call. Open this on a second screen: the
 * Concierge at / rings it, and whoever holds it plays the restaurant.
 *
 * The Booker's agent id is read server-side and handed down, so there is no
 * second NEXT_PUBLIC_ copy of it to keep in sync. An agent id is a public
 * identifier either way — the widget on / puts one in the HTML.
 */
export default function PhonePage() {
  return <Phone agentId={process.env.ELEVENLABS_BOOKER_AGENT_ID ?? null} />;
}
