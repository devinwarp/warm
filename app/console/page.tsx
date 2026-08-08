import { Console } from "../console";

/**
 * The original Dial console: the agent that answers as a business. Still the
 * fallback demo. Booking calls no longer come here — they ring /phone.
 */
export default function ConsolePage() {
  return <Console agentId={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? null} />;
}
