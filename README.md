# Dial

A phone line that answers as a business, using only what that business publishes
on its own website — and re-reads the site mid-conversation when the answer
might have changed since this morning.

> *"Let me check their site… as of just now, they're open till 10 tonight."*

Built at the Dubai Voice Agents Hackathon. Spec:
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
      └─▶ book_table ──▶ /api/book ──▶ ElevenLabs + Twilio ──▶ outbound call
                                                  └─▶ live transcript on screen
```

Tools paint; taps talk. A tap never calls a tool — it sends a contextual update
and the agent decides what happens next, so the voice stays ahead of the screen.

The outbound call goes to the Dial agent at `/console`, primed with the demo
restaurant's Fact Sheet. Our booking bot books a table with our receptionist.

Design doc: [`docs/superpowers/specs/2026-08-08-voice-canvas-design.md`](docs/superpowers/specs/2026-08-08-voice-canvas-design.md).

## Why each sponsor is load-bearing

| Sponsor | Role | Remove it and… |
|---|---|---|
| **ElevenLabs** | Conversational agent — multilingual, interruptible, calls server tools mid-conversation | …this is a chatbot, and the target market doesn't use chatbots |
| **Context.dev** | Crawls at onboarding **and** serves the live mid-call lookup | …onboarding is a week of manual work *and* every answer is a stale cache |
| **Devin** | Drove all three build workstreams in parallel — see [`docs/agents/`](docs/agents/) | …4 people ship one workstream in 4.5 hours instead of three |

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
  widget over phone number, dynamic variables over knowledge base, live tier over
  crawl-once, and the extraction approach.

The rule we kept coming back to: an agent that can't see the contract invents
one. Every session pointed at the schema first.

## Safety property

An agent that invents a price in front of a customer is worse than no agent. So:

- No field is ever inferred. Not on the site → `null`.
- Every unpublished field renders as `"not published on the site"`, never `""` —
  an empty string reads to a model as permission to improvise.
- The refusal rule is verified by an eval harness, not by hoping.

## Stack

Next.js on Vercel · Supabase Postgres (one table, the fact sheet cache) ·
OpenRouter for extraction (any model; default `google/gemini-3.1-flash-lite`) ·
ElevenLabs Agents · Context.dev

## Running it

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
```

Database — two tables:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_factsheets.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_places.sql
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

Checks:

```bash
npm run typecheck
npm test              # 88 unit tests
npm run smoke         # end-to-end, needs the dev server up
npm run prewarm       # fill the places cache before a demo
```

`typecheck` and `test` run in CI on every push. `smoke` needs a system Chrome;
its voice leg self-skips when no agent id is configured.

## Layout

```
app/page.tsx       the voice canvas
app/canvas.tsx     the five client tools + conversation wiring
app/cards.tsx      every card the agent can paint
app/console.tsx    the original Dial receptionist, now at /console

app/api/crawl/     URL -> Fact Sheet (Lijeesh)
app/api/lookup/    the lookup_live server tool (Lijeesh)
app/api/places/    Apify Google Maps — both canvas flows
app/api/geocode/   Nominatim — area confirmation before the slow scrape
app/api/book/      the outbound booking call, allowlist-guarded

lib/factsheet.ts   the contract — zod schema + variable flattening
lib/canvas.ts      card model + reducer
lib/places.ts      Apify client
lib/booking.ts     the allowlist and the outbound call
lib/supabase.ts    fact sheet + places cache

prompts/           Concierge, Booker, and the Dial receptionist prompts
fixtures/          shared examples, committed before the implementations
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
