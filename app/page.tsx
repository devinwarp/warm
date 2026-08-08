import { Console } from "./console";

export default function Page() {
  return <Console agentId={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? null} />;
}
