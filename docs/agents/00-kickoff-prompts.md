# Kickoff prompts

Four Devin sessions run in parallel — one per lane. These are the starting
prompts, verbatim. Copy yours, run it, then open `NN-<lane>-<name>.md` and record
the session link, what came back, and what you had to correct.

The corrections are the point. A log of four clean successes tells a judge
nothing about how we steer; a log showing where Devin went wrong and what
re-prompt fixed it is the actual artifact.

## Repo setup for every session

Configure once in Devin's repo settings so it can verify its own work:

- **Install:** `npm install`
- **Test:** `npm run typecheck && npm test`
- **Lint/build:** `npm run build`

A session that can't run those is guessing.

## Rules that apply to all four sessions

Paste this block at the top of every prompt.

```
Read AGENTS.md at the repo root first, then plans/PRD-voice-receptionist-hackathon.md
sections 7 and 8. Those are binding.

Hard constraints:
- Do NOT modify lib/factsheet.ts. It is the contract three workstreams build
  against in parallel. If you believe it needs to change, stop and say so
  instead of changing it.
- Do NOT add dependencies. Node stdlib first, then what is already installed.
- Do NOT touch files outside the ones named in this task. Three other sessions
  are working in this repo right now.
- TypeScript strict, no `any`.
- Never infer a fact about a business. Not published on the site -> null.
- `npm run typecheck && npm test` must pass before you open the PR.
- Work on a branch and open one PR. Do not push to main.
```

---

## Taha — Voice

Devin cannot reach the ElevenLabs dashboard, so agent creation, voice selection,
and prompt tuning stay manual. What Devin can build is the code that keeps the
dashboard and the repo from drifting apart.

```
Build lib/elevenlabs.ts and scripts/sync-agent.mts.

lib/elevenlabs.ts exports:
- `agentConfig(sheet: FactSheet)` — returns the conversation-initiation payload
  for a call: the dynamic variables from `factsheetToVariables()` in
  lib/factsheet.ts, nothing else invented.
- `lookupLiveTool(baseUrl: string)` — returns the ElevenLabs server-tool
  definition for `lookup_live`, pointing at POST {baseUrl}/api/lookup. Its
  request body must match what app/api/lookup/route.ts already parses:
  { question: string, source_url: string }. Read that file; do not guess the shape.

scripts/sync-agent.mts pushes the system prompt to the agent via the ElevenLabs
API, so prompts/system-prompt.md stays the single source of truth:
- Read the prompt with `systemPromptTemplate()` from lib/prompt.ts.
- PATCH it to the agent at ELEVENLABS_AGENT_ID using ELEVENLABS_API_KEY.
- Register the lookup_live tool from `lookupLiveTool()`.
- Print what changed. Refuse to run if either env var is missing.
- Look up the current ElevenLabs agent-update endpoint and payload shape in
  their docs before writing it. Do not invent field names.

Add one test for `agentConfig`: every value it returns is a string (ElevenLabs
dynamic variables are flat), and it contains no key that
`factsheetToVariables()` does not supply.
```

---

## Lijeesh — Data

`lib/crawl.ts` and `lib/llm.ts` already exist. Start by fixing what's wrong with
them, not by adding.

```
Task 1, highest priority. lib/crawl.ts currently does a plain `fetch()` and
strips HTML tags. That is not acceptable: Context.dev is a sponsor whose
integration has to be structurally load-bearing (see PRD section 6), and a raw
fetch also returns nothing useful for the JavaScript-rendered sites most Dubai
SMEs run.

Replace the fetch with a Context.dev crawl. Read Context.dev's own documentation
for the current endpoint, auth header, and response shape — do not guess. Keep
the existing extraction prompt and the FactSheetSchema.parse() at the end
exactly as they are; only the "get the page content" step changes. Keep
`source_url` and `crawled_at` set by us, never by the model.

Task 2. Implement `lookupLive()` in app/api/lookup/route.ts. It takes a question
and a source_url and queries Context.dev live, scoped to that URL's domain, and
returns a short snippet answering the question. Respect the existing 6s
AbortSignal — on timeout or no result the route already returns
{ answer: null }, and that path must keep working. Do not change the route's
response shape; the voice agent is built against it.

Task 3. Pre-crawl two real Dubai SME websites and commit their Fact Sheets to
fixtures/ so the demo survives venue wifi. Pick sites that actually crawl —
verify, don't assume. Do not overwrite the existing fixtures.

Add one test per task that fails if the logic breaks. Mock the network; no test
may make a real API call.
```

---

## Raja — Frontend

```
Build the single page in app/page.tsx. There is exactly one screen; do not add
routing, settings, history, or a dark-mode toggle.

It needs:
1. A URL input and one action button, posting to POST /api/crawl with { url }.
2. A crawl log that streams progress while the request is in flight.
3. The returned Fact Sheet rendered. Import the type from lib/factsheet.ts —
   do not redeclare it. Fields that are null or the string "not published on the
   site" must render as visibly absent, not as blank space: a judge will compare
   this against the real website.
4. A "Talk to it" button that mounts the ElevenLabs widget:
   <elevenlabs-convai agent-id={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID}>
5. A small "last read: HH:MM" stamp from the Fact Sheet's crawled_at.

Build against fixtures/factsheet.example.json so you are not blocked on the
crawl endpoint being finished.

Note: .claude/rules/frontend.md assumes shadcn/ui and Zustand. Neither is
installed and you may not install them. Use Tailwind (already set up) and React
state. Tell Shameer that rule file is stale rather than following it.
```

---

## Shameer — Glue & pitch

Mostly not Devin-shaped work — Vercel, Supabase, keys, and the pitch are hands-on.
The one piece worth delegating:

```
Add a health check at app/api/health/route.ts. It returns which integrations are
actually configured and reachable, so we can tell in one request whether the
demo will work on venue wifi:

{ context: "ok" | "missing_key" | "unreachable",
  openrouter: ..., elevenlabs: ..., supabase: ... }

Check env vars are present, then make the cheapest real call each service
offers. Total timeout 5 seconds; never hang. Never include a key, or any part of
one, in the response. Add one test with the network mocked.
```
