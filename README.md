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

Database — one table, `supabase/migrations/0001_factsheets.sql`:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_factsheets.sql
```

Checks:

```bash
npm run typecheck
npm test
```

Both run in CI on every push.

## Layout

```
app/api/crawl/    URL -> Fact Sheet (Lijeesh)
app/api/lookup/   the lookup_live server tool (Lijeesh)
app/page.tsx      the one page (Raja)
lib/factsheet.ts  the contract — zod schema + variable flattening
lib/supabase.ts   fact sheet cache
fixtures/         shared example, committed before the implementations
docs/agents/      Devin steering log
docs/adr/         decisions that changed the build
```

## What we deliberately didn't build

Auth, accounts, multi-tenant, booking, payments, call history, analytics,
background re-crawls. Full list in PRD §4.

Next, if this goes further: multi-tenant provisioning, then a freshness policy
per fact type — hours and prices re-read often, addresses rarely. Booking third.
