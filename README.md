# Dial

A phone line that answers as a business, using only what that business publishes
on its own website — and re-reads the site mid-conversation when the answer
might have changed since this morning.

> *"Let me check their site… as of just now, they're open till 10 tonight."*

Built at the Dubai Voice Agents Hackathon. Engineering reasoning:
[`TECH-SPEC.md`](TECH-SPEC.md). Product spec:
[`plans/PRD-voice-receptionist-hackathon.md`](plans/PRD-voice-receptionist-hackathon.md).
The six judging questions are answered in [one section](#the-six-questions).

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
  book_table ──▶ POST /api/ring ──▶ the line (Supabase) ──▶ /phone polls ──▶ rings
                                                            │
                                       you answer ──────────┴──▶ Booker agent
                                       (WebRTC, booking pre-loaded as
                                        dynamic variables)
                                            └─▶ PATCH /api/ring ──▶ transcript
                                                  back on the caller's card
```

You play the restaurant: the Booker asks you for the table, and the caller
watches the transcript of your conversation appear on the canvas at `/`.

Every booking call goes here — there is no Twilio number and no PSTN leg, so
there is nothing to allowlist and nothing that can dial a stranger.

It needs `ELEVENLABS_BOOKER_AGENT_ID` and nothing else. `ELEVENLABS_AGENT_PHONE_NUMBER_ID`
and `DEMO_BOOKING_NUMBERS` are unused now and can go.

The line is a single row in Supabase (`supabase/migrations/0004_calls.sql`).
It has to be shared state: the ring and the answer are separate requests, and
on Vercel they are not guaranteed to reach the same instance. Without Supabase
configured it falls back to memory, which is fine for one local process.

Bot-to-bot — the Booker dialling an allowlisted number pointed at the Dial
receptionist, so our booking bot books a table with our own receptionist —
needed a real phone number between the two agents. That leg is deleted. A human
answers instead, and `/console` stays as the receptionist demo in its own right.

Design doc: [`docs/superpowers/specs/2026-08-08-voice-canvas-design.md`](docs/superpowers/specs/2026-08-08-voice-canvas-design.md).

## The six questions

### 1. What problem does this solve, and who is it for? *(~30s)*

Small businesses with a working website and a phone nobody answers — the salon on
Al Wasl Road, the clinic, the restaurant taking bookings over WhatsApp at 11pm.
Their customers call, in five languages, after hours, asking the six questions the
website already answers.

AI receptionists exist and none of them reached these businesses, because
onboarding is a week of someone hand-building a knowledge base per customer — and
the day it's finished it starts going stale. Prices change, a branch closes,
Ramadan hours shift.

Dial replaces both halves: paste a URL and the agent is answering in about a
minute, and it re-reads the site mid-conversation for anything that might have
moved since. It matters because onboarding cost is what keeps this market
unserved, and staleness is what makes an agent worse than voicemail — one
confidently recited stale price loses the customer and the trust in one turn.

### 2. Live demo *(~2 min)*

Step-by-step with the seed phrases: [Trying it](#trying-it). What the agent pulls,
when, and from where:

| When | What it pulls | From where |
|---|---|---|
| Onboarding, once, ~60s | Whole site → LLM-ready markdown → zod-validated Fact Sheet (hours, services with prices, locations, booking policy, languages) | **context.dev** `POST /v1/web/crawl`, `useMainContentOnly: true` — nav, footers and cookie banners dropped server-side. Cached in Supabase. |
| Mid-conversation, on demand | One page, re-read as of this second, to answer "are you open tonight", "what does that cost now" | **context.dev** `GET /v1/web/scrape/markdown`, **`maxAgeMs: 0`** — the business's own site. `lookup_live`, 6s ceiling. |
| Mid-conversation, on demand | Star rating, review count, the live "Open · Closes 2 AM" line | **context.dev** same endpoint, `useMainContentOnly: false` — the place's **Google listing**. `check_live`. |
| During a search | Candidate places, coordinates, review keywords | Apify Google Maps actor; Nominatim for area confirmation. |

Two live tiers, two different sources, two different questions — a website never
publishes how it is rated or admits it is closed right now; a Google listing
never publishes the price list. Both re-read while the caller is mid-sentence.

The demo says the freshness out loud — *"4.3, and it says it's open until 2am — I
just looked"* — and the page stamps the fetch time next to the answer, so the
audience sees the read happen rather than taking the agent's word for it.

### 3. Why is live web data essential? *(~30s)*

**Our project would fundamentally break without live web data because the only
thing we actually sell is that the answer is true *right now* — every other part
of the product is a cache, and a cache is a photograph of a business that has
since changed its hours.** Strip the live tier out and what's left is the stale
knowledge base we set out to replace, with a nicer voice.

It does handle data that changes mid-conversation, and that is a staged, provable
claim rather than an assertion: the three fixture sites at `/demo/*` carry a
status line we flip from a phone bookmark (`/api/demo-status`). Ask the agent the
hours, flip the line, ask again — the answer changes under it, inside the same
conversation, because `maxAgeMs: 0` means there is no cache between the question
and the site.

### 4. Beyond text-to-speech, what does the agent do on its own? *(~45s)*

**Decisions it makes without us:** which of six tools to call, and in what order;
whether a question is covered by the cached sheet or needs a live read (the
time-sensitive cues — *tonight, still, right now* — are its judgement, not a
regex on our side); which of four missing booking facts to ask for next, one
question at a time, because no form ever appears; when to refuse. And once it has
the booking, it places a second call, talks to a human at the restaurant on the
other end, and comes back with the outcome.

**The refusal is the designed behaviour, not a guardrail bolted on.** Unpublished
is `null`, renders as `"not published on the site"`, and the agent says it doesn't
know and offers a callback. A 16-case eval harness fails the build for nine banned
hedges ("typically", "usually", "approximately"…) or for quoting money on an
uncovered question.

**ElevenLabs features doing real work** — none of them TTS:

- **Client tools** (`useConversationClientTool`) + **`sendContextualUpdate`** —
  the whole generative-UI mechanic. This is why `/` uses `@elevenlabs/react`
  rather than the `<elevenlabs-convai>` embed, which cannot register client tools.
- **Server tool** — `lookup_live` is the entire first live tier, called
  mid-conversation.
- **Dynamic variables at conversation start** — the Fact Sheet reaches the
  receptionist, and the whole booking reaches the Booker before the phone rings,
  by the same injection path. No knowledge-base upload, no propagation wait; this
  is what makes "paste a URL, talk in 60 seconds" true rather than aspirational.
- **Interruption and mid-conversation language switching** — callers talk over
  receptionists, and English/Arabic/Hindi/Tagalog is the real language mix of a
  Dubai SME's callers.
- **WebRTC** for both the canvas and the desk phone.

**Personality** is designed in the committed prompts, in behaviour rather than
adjectives: one or two sentences, warm and quick, no corporate filler; say what
you're doing *before* a slow tool because silence sounds like a dropped call; stop
mid-word when interrupted; switch language without remarking on it; say you are an
AI if asked and carry on. Three agents, three personalities — the Concierge works
*for* the caller, the receptionist answers *as* the business, the Booker is a
stranger on the phone who states its business and gets off the line.

Voice selection itself is the one thing left in the ElevenLabs dashboard —
`scripts/setup-agents.mts` pins prompts, tools and language but deliberately does
not pin a `voice_id`, so the voice is chosen per demo rather than committed.

### 5. What makes this novel? *(~30s)*

**The knowledge source is the business's own live website, read twice — once to
onboard, again mid-sentence — so there is no knowledge base in the product at
all.** Everyone's receptionist demo has an index someone filled in; ours has a
URL. That single choice is what removes the week of onboarding *and* the staleness
in one move.

Two things on top of it we haven't seen combined: two live tiers from two
different sources answering different questions in the same breath (own site for
facts, Google listing for reputation and open-now), and a voice agent that paints
its own UI through client tools, then hands off to a second agent that calls a
human and streams that transcript back onto the first caller's screen. Voice →
screen → voice, with taps as conversational context rather than clicks.

### 6. Hardest problem *(~30s)*

**A client tool that waits on a human hangs the conversation.** The canvas needs
the caller to confirm a match by tapping, but a tool call is a blocking turn — the
agent stands mute until it returns, and a tool waiting on a tap that may never
come is a dead line. Making the taps *interruptions* didn't work either: the agent
loses its place.

The fix was to stop treating a tap as an answer. Tools return immediately with a
line the agent must say out loud; taps travel back separately as
`sendContextualUpdate("The visitor tapped …")`, which the agent folds into
whatever it is already doing. Nothing blocks, and the voice stays ahead of the
screen instead of narrating it. That inversion is the load-bearing idea in
`app/canvas.tsx`.

Runner-up, and the most expensive debugging cycle: passing the area to the Apify
actor as `locationQuery` resolves "Jumeirah Lake Towers Dubai" to a point of
interest with a 0 km² polygon, so every result is discarded as `outOfLocation` and
the actor returns an empty list after 12 seconds — a silent success. The area goes
in the search string. The comment is in the code so nobody re-learns it.

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

Next.js 16 on Vercel · React 19 · TypeScript strict · Supabase Postgres (four
tables: fact sheets, places cache, demo status, the phone line) · OpenRouter for every model call
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
| `ELEVENLABS_API_KEY` | yes | ElevenLabs → Profile. Used by `setup-agents`. |
| `APIFY_TOKEN` | for the canvas | apify.com → Settings → API token. Costs money, so `setup-agents` won't do it for you. |
| `NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID` | for the canvas | Printed by `setup-agents` below. |
| `ELEVENLABS_BOOKER_AGENT_ID` | for booking | Printed by `setup-agents` below. |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | for `/console` | The Dial receptionist agent. Without it the crawl still works; the Talk button says the agent isn't configured. |
| `OPENROUTER_MODEL` | no | Any model slug. Default `google/gemini-3.1-flash-lite`. |
| `CRAWL_MAX_PAGES` / `CRAWL_MAX_DEPTH` | no | Crawl level. Defaults 8 pages, depth 1. Also per-request in the POST body. |
| `EVAL_MODEL` | no | `npm run eval` only. Defaults to `OPENROUTER_MODEL`. |
| `ELEVENLABS_AGENT_PHONE_NUMBER_ID` / `DEMO_BOOKING_NUMBERS` | unused | The Twilio leg is gone. Delete these two lines from your `.env.local`. |

Database — four tables. `SUPABASE_DB_URL` is for this migration only; nothing at
runtime reads it. Or paste each file into the Supabase SQL editor.

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_factsheets.sql   # fact sheet cache
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_places.sql       # places cache
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_demo_status.sql  # demo status line
psql "$SUPABASE_DB_URL" -f supabase/migrations/0004_calls.sql        # the phone line
```

Without `calls`, `/api/ring` returns 502 rather than accepting a call nobody
will ever hear.

Agents — creates the Concierge and Booker in ElevenLabs from the committed
prompts, and prints the two agent ids to paste back into `.env.local`. It is
idempotent, so it is also how you push a prompt edit:

```bash
node --env-file=.env.local scripts/setup-agents.mts
```

One thing it deliberately does not do, because it costs money:

- **`APIFY_TOKEN`** — apify.com → Settings → API token.

No phone number is needed at all. Every booking call rings `/phone` in the
browser; nothing reaches a phone network.

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
npm test              # 95 unit tests, 14 files
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
app/api/demo-status/  stage control: flip a fixture site's status line

lib/factsheet.ts   the contract — zod schema + variable flattening
lib/canvas.ts      card model + reducer
lib/places.ts      Apify client
lib/liveread.ts    Google listing -> rating, open/closed, highlights
lib/ring.ts        the phone line — one call, in Supabase
lib/geocode.ts     Nominatim, never throws
lib/demo.ts        the fixture sites and their presets
lib/supabase.ts    fact sheet + places + demo status + the line

prompts/           Concierge, Booker, and the Dial receptionist prompts
scripts/           agent provisioning, cache pre-warm, e2e smoke
demo-sites/        hand-written fixture business sites, crawled on stage
fixtures/          shared examples, committed before the implementations
evals/             16-case refusal harness + deterministic grader
docs/agents/       Devin steering log
docs/adr/          decisions that changed the build
docs/superpowers/  spec and implementation plan for the canvas
```

## Safety: nothing dials

The booking arguments come from a language model parsing speech from whoever is
holding the microphone on a public URL. An endpoint that turns those into a
phone call is a robodialer with extra steps.

So there isn't one. `/api/ring` writes a row; `/phone` reads it. No number is
ever dialled — the outbound Twilio leg and its `DEMO_BOOKING_NUMBERS` allowlist
were deleted rather than left switched off. The payload is still validated
server-side in `lib/ring.ts`, because it becomes what the Booker says out loud.

## What we deliberately didn't build

Auth, accounts, multi-tenant, payments, call history, analytics, background
re-crawls. Calling any number not on the allowlist. Parsing "tomorrow at eight"
into a timestamp. Full original list in PRD §4.

Booking *was* on that list and is now built — see the canvas spec for why the
scope changed.

Next, if this goes further: multi-tenant provisioning, then a freshness policy
per fact type — hours and prices re-read often, addresses rarely.
