/**
 * Provision the two canvas agents in ElevenLabs from the committed prompts:
 *
 *   node scripts/setup-agents.mts
 *
 * Idempotent — re-running updates the existing tools and agents in place
 * rather than making duplicates, so this is also how you push a prompt edit.
 *
 * Prints the env vars to paste into .env.local. Needs ELEVENLABS_API_KEY.
 *
 * It does NOT buy a Twilio number or import one — that costs money and is a
 * deliberate human step. See the plan's manual-setup section.
 */

import { readFileSync } from "node:fs";

const API = "https://api.elevenlabs.io/v1";
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("ELEVENLABS_API_KEY is required. Load .env.local first:");
  console.error("  node --env-file=.env.local scripts/setup-agents.mts");
  process.exit(1);
}

async function api(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": key!, "content-type": "application/json", ...init?.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status} ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/**
 * The prompt files are the source of truth. Pull the fenced block that follows
 * the "## System prompt" heading so an edit to the markdown is an edit to the
 * agent — no copy-paste step that can silently drift.
 */
function systemPrompt(file: string): string {
  const md = readFileSync(new URL(`../prompts/${file}`, import.meta.url), "utf8");
  const body = md.split("## System prompt")[1];
  const block = body?.match(/```\n([\s\S]*?)```/);
  if (!block?.[1]) throw new Error(`no fenced system prompt found in ${file}`);
  return block[1].trim();
}

function firstMessage(file: string): string {
  const md = readFileSync(new URL(`../prompts/${file}`, import.meta.url), "utf8");
  const block = md.split("**First message**")[1]?.match(/```\n([\s\S]*?)```/);
  if (!block?.[1]) throw new Error(`no first message found in ${file}`);
  return block[1].trim();
}

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });

/** Must match the names and parameters registered in app/canvas.tsx. */
const TOOLS = [
  {
    name: "find_business",
    description:
      "Find a business by name and show the matches on screen. Call this when the caller names a business they want to know about.",
    properties: { name: str("The business name as the caller said it"), locality: str("Area or city, if given") },
    required: ["name"],
  },
  {
    name: "confirm_business",
    description:
      "Confirm which match the caller meant and read that business's website. Call after the caller confirms one of the candidates.",
    properties: { index: int("0-based index of the candidate the caller confirmed") },
    required: ["index"],
  },
  {
    name: "resolve_area",
    description:
      "Show an area on a map so the caller can confirm it. Call this before searching for restaurants.",
    properties: { locality: str("The area, neighbourhood or city the caller named") },
    required: ["locality"],
  },
  {
    name: "search_restaurants",
    description:
      "Search restaurants by cuisine in a confirmed area and show them on screen. Only call after the caller confirms the area.",
    properties: { cuisine: str("Cuisine, e.g. Lebanese"), area: str("The confirmed area") },
    required: ["cuisine", "area"],
  },
  {
    name: "book_table",
    description:
      "Phone the chosen restaurant and book a table. Only call once you have the party size, the time, the caller's name and their phone number.",
    properties: {
      index: int("0-based index of the chosen restaurant"),
      party_size: int("How many people"),
      when: str("When, in the caller's own words, e.g. 'tomorrow at eight'"),
      customer_name: str("The caller's name for the booking"),
      customer_phone: str("The caller's callback number, E.164 if possible"),
    },
    required: ["index", "party_size", "when", "customer_name", "customer_phone"],
  },
];

// ---------------------------------------------------------------- tools

const existingTools = ((await api("/convai/tools")).tools ?? []) as {
  id: string;
  tool_config: { name: string };
}[];

const toolIds: string[] = [];

for (const tool of TOOLS) {
  const config = {
    type: "client",
    name: tool.name,
    description: tool.description,
    // Every one of these returns a line the agent must hear before it speaks.
    expects_response: true,
    response_timeout_secs: 120,
    parameters: { type: "object", properties: tool.properties, required: tool.required },
  };

  const found = existingTools.find((t) => t.tool_config?.name === tool.name);
  if (found) {
    await api(`/convai/tools/${found.id}`, { method: "PATCH", body: JSON.stringify({ tool_config: config }) });
    toolIds.push(found.id);
    console.log(`tool  updated  ${tool.name}  ${found.id}`);
  } else {
    const created = await api("/convai/tools", { method: "POST", body: JSON.stringify({ tool_config: config }) });
    const id = String(created.id);
    toolIds.push(id);
    console.log(`tool  created  ${tool.name}  ${id}`);
  }
}

// --------------------------------------------------------------- agents

const existingAgents = ((await api("/convai/agents")).agents ?? []) as {
  agent_id: string;
  name: string;
}[];

async function upsertAgent(name: string, config: Record<string, unknown>): Promise<string> {
  const found = existingAgents.find((a) => a.name === name);
  if (found) {
    await api(`/convai/agents/${found.agent_id}`, { method: "PATCH", body: JSON.stringify(config) });
    console.log(`agent updated  ${name}  ${found.agent_id}`);
    return found.agent_id;
  }
  const created = await api("/convai/agents/create", { method: "POST", body: JSON.stringify(config) });
  const id = String(created.agent_id);
  console.log(`agent created  ${name}  ${id}`);
  return id;
}

const conciergeId = await upsertAgent("Dial Concierge", {
  name: "Dial Concierge",
  conversation_config: {
    agent: {
      prompt: { prompt: systemPrompt("concierge-prompt.md"), tool_ids: toolIds },
      first_message: firstMessage("concierge-prompt.md"),
      language: "en",
    },
  },
});

const bookerId = await upsertAgent("Dial Booker", {
  name: "Dial Booker",
  conversation_config: {
    agent: {
      prompt: { prompt: systemPrompt("booker-prompt.md") },
      first_message: firstMessage("booker-prompt.md"),
      language: "en",
    },
  },
});

console.log(`
Paste into .env.local:

NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID=${conciergeId}
ELEVENLABS_BOOKER_AGENT_ID=${bookerId}

Still manual (they cost money or need a human):
  APIFY_TOKEN                       apify.com -> Settings -> API token
  ELEVENLABS_AGENT_PHONE_NUMBER_ID  buy a Twilio number, import it under
                                    ElevenLabs -> Phone numbers, attach Dial Booker
  DEMO_BOOKING_NUMBERS              the number the Booker is allowed to dial
`);
