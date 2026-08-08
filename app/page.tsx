import { Canvas } from "./canvas";

export default function Page() {
  return <Canvas agentId={process.env.NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID ?? null} />;
}
