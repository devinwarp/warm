import { Console } from "../console";

/**
 * The original Dial console. Still the fallback demo, and still the agent that
 * answers the demo booking number as the restaurant (see the voice-canvas spec).
 */
export default function ConsolePage() {
  return <Console agentId={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? null} />;
}
