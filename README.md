# Dial

A phone line that answers as a business, using only what that business publishes
on its own website — and re-reads the site mid-conversation when the answer
might have changed since this morning.

> *"Let me check their site… as of just now, they're open till 10 tonight."*

Built at the Dubai Voice Agents Hackathon. Engineering reasoning:
[`TECH-SPEC.md`](TECH-SPEC.md). Product spec:
[`plans/PRD-voice-receptionist-hackathon.md`](plans/PRD-voice-receptionist-hackathon.md).

## The problem

AI receptionists exist. None of them reached the salon on Al Wasl Road, because
onboarding costs a week of someone hand-building a knowledge base — and the
moment it's built it starts going stale.

The crawl replaces onboarding. The live lookup replaces staleness.

## How it works

```
                  ONBOARDING (once, ~60s)
  URL ──▶ Context.dev crawl ──▶ extraction pass ──▶ Fact Sheet ──▶ Supabase
                                  (OpenRouter)       (zod-validated)   cache

                  CONVERSATION (every call)
  Fact Sheet ──▶ dynamic variables ──▶ ElevenLabs agent
                                            │
                     covered? ──────────────┤
                                            │
                     uncovered or           └──▶ lookup_live tool
                     time-sensitive?              └──▶ Context.dev, live
                                                        └──▶ answer + timestamp
                                            │
                     neither? ──────────────┴──▶ refuse, offer callback
```

Two knowledge tiers. The cached Fact Sheet is fast; the live tier is current.
The agent never has a third option where it guesses.

## The voice canvas

`/` is a voice canvas: the visitor talks, and a Concierge agent paints the page
through client tools. `/console` is the original Dial receptionist above.

```
                  FIND A BUSINESS
  "tell me about Qamar Table"
      └─▶ find_business ──▶ Apify ──▶ candidate cards ──▶ confirm
                                                            └─▶ /api/crawl
                                                                └─▶ Fact Sheet

                  BOOK A TABLE
  "Lebanese food in JLT"
      └─▶ resolve_area ──▶ map card ──▶ visitor taps ──▶ search_restaurants
                                                            └─▶ Apify ──▶ grid
      └─▶ book_table ──▶ /api/ring ──▶ the phone at /phone rings
                                            └─▶ answered ──▶ Booker agent
                                                  └─▶ live transcript on screen
```

Tools paint; taps talk. A tap never calls a tool — it sends a contextual update
and the agent decides what happens next, so the voice stays ahead of the screen.

## The phone

`/phone` is the restaurant's end of the line, with no Twilio number in the
middle. Open it on a second screen, press **Take the desk**, and it waits.

```
  book_table ──▶ POST /api/ring ──▶ in-memory line ──▶ /phone polls ──▶ rings
                                                            │
                                       you answer ──────────┴──▶ Booker agent
                                       (WebRTC, booking pre-loaded as
                                        dynamic variables)
                                            └─▶ PATCH /api/ring ──▶ transcript
                                                  back on the caller's card
```

You play the restaurant: the Booker asks you for the table, and the caller
watches the transcript of your conversation appear on the canvas at `/`.

`/api/book` — the real Twilio leg, allowlisted in `lib/booking.ts` — is still
there for when there's a number to dial. Nothing on the `/phone` path reaches
the PSTN, which is why it has no allowlist.

It needs `ELEVENLABS_BOOKER_AGENT_ID` and nothing else — no Twilio number, no
`DEMO_BOOKING_NUMBERS`.

On the Twilio path, the number the Booker dials is a matter of dashboard config,
not code: point an allowlisted number at the Dial receptionist agent — the same
agent that serves `/console`, primed with the demo restaurant's Fact Sheet — and
our booking bot books a table with our own receptionist. That routing is why
`/console` survived the pivot, and it is why there is no third agent.

Design doc: [`docs/superpowers/specs/2026-08-08-voice-canvas-design.md`](docs/superpowers/specs/2026-08-08-voice-canvas-design.md).

## Why each sponsor is load-bearing

| Sponsor | Role | Remove it and… |
|---|---|---|
| **ElevenLabs** | Conversational agent — multilingual, interruptible, calls server tools mid-conversation | …this is a chatbot, and the target market doesn't use chatbots |
| **Context.dev** | Crawls at onboarding **and** serves the live mid-call lookup | …onboarding is a week of manual work *and* every answer is a stale cache |
| **Devin** | Drove all three build workstreams in parallel — see [`docs/agents/`](docs/agents/) | …4 people ship one workstream in six hours instead of three, and the canvas never happens |

## How we steered the agents

The repo is set up so three people and their Devin sessions could work in
parallel without merging into each other:

- **The contract is code.** [`lib/factsheet.ts`](lib/factsheet.ts) is a zod
  schema imported by all three workstreams, committed at T+20 alongside a
  fixture, before any of them had a working implementation. Nobody blocked on
  anybody, and nobody had to guess a field name.
- **[`AGENTS.md`](AGENTS.md) is the standing brief** every session starts from —
  scope, ownership, the no-inference rule, the no-new-dependencies rule.
- **[`docs/agents/`](docs/agents/) is the steering log.** One file per session:
  the verbatim prompt, what came back, and what we had to correct. The
  corrections are the interesting part.
- **[`docs/adr/`](docs/adr/) records the four decisions** that changed the build:
  [widget over phone number](docs/adr/0001-widget-over-phone-number.md),
  [dynamic variables over knowledge base](docs/adr/0002-dynamic-variables-over-knowledge-base.md),
  [live tier over crawl-once](docs/adr/0003-live-lookup-tier.md), and
  [the extraction approach](docs/adr/0004-openrouter-extraction-pass.md).
- **[`docs/superpowers/`](docs/superpowers/) is the canvas pivot**: the design doc
  was written and approved before ~7,000 lines were built against it.

The rule we kept coming back to: an agent that can't see the contract invents
one. Every session pointed at the schema first.

## Safety property

An agent that invents a price in front of a customer is worse than no agent. So:

- No field is ever inferred. Not on the site → `null`.
- Every unpublished field renders as `"not published on the site"`, never `""` —
  an empty string reads to a model as permission to improvise.
- The refusal rule is verified by an eval harness, not by hoping.

## Stack

Next.js 16 on Vercel · React 19 · TypeScript strict · Supabase Postgres (three
tables: fact sheets, places cache, demo status) · OpenRouter for every model call
(any model; default `google/gemini-3.1-flash-lite`) · ElevenLabs Agents via
`@elevenlabs/react` · Context.dev · Apify Google Maps · Nominatim

## Running it

Assumes a clean machine. Node 22+ and npm are the only prerequisites.

```bash
git clone https://github.com/devinwarp/warm.git
cd warm
npm install
cp .env.example .env.local   # fill in the keys — table below
npm run dev                  # http://localhost:3000
```

Every variable, where to get it, and whether you can skip it:

| Variable | Required | Where to get it |
|---|---|---|
| `CONTEXT_DEV_API_KEY` | yes | [context.dev](https://context.dev) dashboard. `CONTEXT_API_KEY` also accepted. |
| `OPENROUTER_API_KEY` | yes | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Same page. Server-only; never expose it to the browser. |
| `ELEVENLABS_API_KEY` | yes | ElevenLabs → Profile. Used by `setup-agents` and the Twilio leg. |
| `APIFY_TOKEN` | for the canvas | apify.com → Settings → API token. Costs money, so `setup-agents` won't do it for you. |
| `NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID` | for the canvas | Printed by `setup-agents` below. |
| `ELEVENLABS_BOOKER_AGENT_ID` | for booking | Printed by `setup-agents` below. |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | for `/console` | The Dial receptionist agent. Without it the crawl still works; the Talk button says the agent isn't configured. |
| `OPENROUTER_MODEL` | no | Any model slug. Default `google/gemini-3.1-flash-lite`. |
| `CRAWL_MAX_PAGES` / `CRAWL_MAX_DEPTH` | no | Crawl level. Defaults 8 pages, depth 1. Also per-request in the POST body. |
| `EVAL_MODEL` | no | `npm run eval` only. Defaults to `OPENROUTER_MODEL`. |
| `ELEVENLABS_AGENT_PHONE_NUMBER_ID` / `DEMO_BOOKING_NUMBERS` | no | Only for the real Twilio leg — see below. The `/phone` demo needs neither. |

Database — three tables. `SUPABASE_DB_URL` is for this migration only; nothing at
runtime reads it. Or paste each file into the Supabase SQL editor.

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_factsheets.sql   # fact sheet cache
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_places.sql       # places cache
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_demo_status.sql  # demo status line
```

Agents — creates the Concierge and Booker in ElevenLabs from the committed
prompts, and prints the two agent ids to paste back into `.env.local`. It is
idempotent, so it is also how you push a prompt edit:

```bash
node --env-file=.env.local scripts/setup-agents.mts
```

Two things it deliberately does not do, because they cost money:

- **`APIFY_TOKEN`** — apify.com → Settings → API token.
- **The phone leg** — buy a Twilio number, import it under ElevenLabs → Phone
  numbers, attach the Booker agent, then set `ELEVENLABS_AGENT_PHONE_NUMBER_ID`
  and put the number you want it allowed to dial in `DEMO_BOOKING_NUMBERS`.
  **Not needed to book a table** — the `/phone` path is the default and reaches
  no phone network at all.

### Trying it

1. Open `/` and press the orb. Say *"tell me about Qamar Table"* — the agent
   searches, you confirm, it reads the site, and `check_live` reads the Google
   listing for the rating and whether it's open right now.
2. To book: *"find me Lebanese food in JLT"*, confirm the area on the map, pick a
   restaurant, and give the agent a party size, time, name and number.
3. Open `/phone` on a second screen first and press **Take the desk** — that is
   the restaurant's end. It rings, you answer, and the caller watches the
   transcript appear on the canvas.
4. To prove the live tier: the three fixture sites are at `/demo/ruwaya`,
   `/demo/qamar`, `/demo/meridian`. Bookmark `/api/demo-status` on your phone,
   ask the agent about opening hours, tap a different preset, ask again — the
   answer changes under it.

Checks:

```bash
npm run typecheck
npm test              # 106 unit tests, 15 files
npm run smoke         # end-to-end, needs the dev server up
npm run prewarm       # fill the places cache before a demo
```

`typecheck` and `test` run in CI on every push. `smoke` needs a system Chrome;
its voice leg self-skips when no agent id is configured.

## Layout

```
app/page.tsx       the voice canvas
app/canvas.tsx     the six client tools + conversation wiring
app/cards.tsx      every card the agent can paint
app/orb.tsx        the persistent voice orb
app/console.tsx    the original Dial receptionist, now at /console
app/phone/         the restaurant's end of the line — a human answers here
app/demo/[slug]/   the three fixture sites, with a mutable status line

app/api/crawl/     URL -> Fact Sheet (Lijeesh)
app/api/lookup/    the lookup_live server tool — the site's own pages (Lijeesh)
app/api/liveread/  the other live tier — the Google listing, rating + open now
app/api/places/    Apify Google Maps — both canvas flows
app/api/geocode/   Nominatim — area confirmation before the slow scrape
app/api/ring/      the demo phone line: ring, poll, answer, transcript
app/api/book/      the real Twilio leg, allowlist-guarded
app/api/demo-status/  stage control: flip a fixture site's status line

lib/factsheet.ts   the contract — zod schema + variable flattening
lib/canvas.ts      card model + reducer
lib/places.ts      Apify client
lib/liveread.ts    Google listing -> rating, open/closed, highlights
lib/ring.ts        the one in-memory phone line
lib/booking.ts     the allowlist and the outbound call
lib/geocode.ts     Nominatim, never throws
lib/demo.ts        the fixture sites and their presets
lib/supabase.ts    fact sheet + places + demo status

prompts/           Concierge, Booker, and the Dial receptionist prompts
scripts/           agent provisioning, cache pre-warm, e2e smoke
demo-sites/        hand-written fixture business sites, crawled on stage
fixtures/          shared examples, committed before the implementations
evals/             16-case refusal harness + deterministic grader
docs/agents/       Devin steering log
docs/adr/          decisions that changed the build
docs/superpowers/  spec and implementation plan for the canvas
```

## Safety: the booking allowlist

`/api/book` will only dial numbers listed in `DEMO_BOOKING_NUMBERS`. An unset or
empty allowlist means **nothing may be dialled** — that is deliberate, not a bug.

The arguments reaching that endpoint come from a language model parsing speech
from whoever is holding the microphone on a public URL. Without the allowlist
this is a robodialer, so it is validated server-side before any outbound
request, and `lib/booking.test.ts` covers the off-list and unset-list cases.

## What we deliberately didn't build

Auth, accounts, multi-tenant, payments, call history, analytics, background
re-crawls. Calling any number not on the allowlist. Parsing "tomorrow at eight"
into a timestamp. Full original list in PRD §4.

Booking *was* on that list and is now built — see the canvas spec for why the
scope changed.

Next, if this goes further: multi-tenant provisioning, then a freshness policy
per fact type — hours and prices re-read often, addresses rarely.
