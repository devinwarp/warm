# TECH-SPEC — Dial

A voice agent that finds a business, reads its website and its Google listing
live while it talks, and phones a restaurant to book you a table.

Written against the code in this repo. Where something is deliberately not
built, or is a demo-grade shortcut, it says so.

---

## 01 — Problem

**Who:** two people, on either end of a phone call nobody wants to make.

The **caller** wants one fact or one small transaction — is it open tonight, what
does it cost, can I get a table at eight. Today that costs a search, three tabs,
a website that may be months stale, and a call that goes to voicemail.

The **business** — a salon, clinic, restaurant on Al Wasl Road — has a working
website and a phone the owner answers between customers. Calls arrive after
hours, in five languages, asking the same six questions the site already answers.

**The pain, on both sides, is the same two failures:**

1. **Onboarding cost.** AI receptionists exist and have not reached these
   businesses, because someone has to hand-build a knowledge base per customer.
   That does not survive contact with a business making AED 300 a day.
2. **Staleness.** The moment that knowledge base exists it starts rotting. Prices
   move, a branch closes, Friday hours shift for Ramadan, the kitchen closes
   early tonight for a private event. A confidently stale answer is worse than
   no answer.

Onboarding cost blocks launch. Staleness churns the customer in month two.

**Why voice:** the fastest path from "I have a question" to "I have the answer"
is saying it out loud, and the caller is one-handed at 9pm. But voice is also
where being wrong is most expensive — a hallucinated price, spoken confidently in
a business's own voice, costs that business a customer and their trust. There is
no hedging tone of voice, no asterisk, no "results may vary". That single
constraint drove more of this codebase than any feature (§03, §04).

---

## 02 — Architecture

Two surfaces over one core. The core is: **turn a URL into structured facts, and
never let a model invent one.**

| Surface | Route | Who the agent works for |
|---|---|---|
| **Voice canvas** | `/` | The visitor. A Concierge agent paints the page as it talks. |
| **Dial console** | `/console` | The business. A receptionist answers *as* them. |
| **The desk phone** | `/phone` | The restaurant. A human answers; an agent calls them. |

### The canvas loop

```
   agent  ──── client tool ────▶  card appended to canvas
                                  tool returns a one-line string
                                  describing what it just showed
     ▲                                        │
     │                                        ▼
     └──── sendContextualUpdate ────  visitor taps a card
```

**Tools paint; taps talk.** A tap never calls a tool. It sends a contextual
update and the agent decides what happens next, so the voice stays ahead of the
screen instead of narrating it after the fact. Client tools return
**immediately** — a tool that blocked waiting for a human would hang the
conversation if the human never tapped. Confirmation always arrives as context,
never as a tool return value.

State is one `useReducer` over an append-only `Card[]` (`lib/canvas.ts`). The
agent paints, it never erases, so the finished page reads as a transcript of what
was found.

### Flow A — find a business, then check it live

```
"tell me about Qamar Table"
   │
   ▼
find_business ──▶ POST /api/places ──▶ Apify Google Maps ──▶ candidate cards
   │                                   (Supabase read-through cache)
   ▼  visitor taps / says which one
confirm_business ──▶ POST /api/crawl ──▶ context.dev crawl ──▶ OpenRouter
   │                                     ──▶ FactSheet (zod) ──▶ Supabase
   ▼
check_live ──▶ POST /api/liveread ──▶ context.dev scrapes the GOOGLE listing
                                       ──▶ rating, "Open · Closes 2 AM"
                                       ──▶ spoken with a timestamp
```

### Flow B — book a table by phone

```
"Lebanese food in JLT"
   │
   ▼
resolve_area ──▶ POST /api/geocode ──▶ Nominatim ──▶ map card
   │             (sub-second: confirm the area BEFORE paying 20-90s of Apify)
   ▼  visitor taps the map
search_restaurants ──▶ POST /api/places ──▶ restaurant grid
   │
   ▼  agent collects party size, time, name, number by voice
book_table ──▶ POST /api/ring ──▶ the line (Supabase) ──▶ /phone rings
                                                       │
                              human presses "Take the desk"
                                                       ▼
                                        Booker agent over WebRTC,
                                        booking pre-loaded as
                                        dynamic variables
                                                       │
                                   PATCH /api/ring ────┘
                                        │
                                        ▼
                        caller's CallCard polls GET /api/ring?id=
                        and streams the transcript onto the canvas
```

The closing shot is the audience watching one agent talk to a human on a second
screen and come back with a table.

### Two live tiers, answering two different questions

This is the part worth being precise about, because they are different sources.

| Tier | Reads | Answers | Why the other can't |
|---|---|---|---|
| `lookup_live` (`/api/lookup`) | the business's **own site**, `maxAgeMs: 0` | "are you open tonight", "what does X cost now" | A cached crawl is a snapshot; this is the site as of this second. |
| `check_live` (`/api/liveread`) | the business's **Google listing** | the rating, the live "Open · Closes 2 AM" line | A website never publishes how it is rated, or admits it is closed right now. |

`useMainContentOnly` is deliberately **off** for the Google listing: the rating
and open/closed line live in page chrome that main-content extraction throws
away. It is **on** for the business's own site, where chrome is nav junk.

Review *text* is never scraped. Counts and keywords come from the places search,
and the card shows both together — nothing anywhere invents a review.

### The contract

`lib/factsheet.ts` is a zod schema imported by every workstream, committed at
T+20 with a fixture, before any implementation existed. Data produces it, Voice
consumes it, Frontend renders it — nobody had to guess a field name.

```ts
business_name: string          hours: string
one_line: string               locations: { branch, address, phone: string|null }[]
services: { name, price: string|null, description }[]
booking_policy: string | null  languages_spoken: string[]
escalation_note: string        source_url: string   crawled_at: string  // ISO8601
```

`source_url` and `crawled_at` are stamped by our code *after* the model returns,
never taken from its output — provenance the agent reads aloud must not be
something an LLM could invent. `Place` (`lib/places.ts`) and `LiveRead`
(`lib/liveread.ts`) follow the same nullability discipline: unpublished is
`null`, and nothing infers it.

### Client tools

All six in `app/canvas.tsx`, registered via `useConversationClientTool`. Names
are drift-tested against the prompt by `prompts/concierge.test.ts`.

| Tool | Parameters | Hits |
|---|---|---|
| `find_business` | `name`, `locality?` | `/api/places` |
| `confirm_business` | `index` | `/api/crawl` |
| `resolve_area` | `locality` | `/api/geocode` |
| `search_restaurants` | `cuisine`, `area` | `/api/places` |
| `check_live` | `index?` | `/api/liveread` |
| `book_table` | `index`, `party_size`, `when`, `customer_name`, `customer_phone` | `/api/ring` |

Missing parameters are the agent's problem, not the UI's. If the visitor hasn't
given a party size, the agent asks. **No form ever appears.**

### Server routes

| Route | Purpose |
|---|---|
| `POST /api/crawl` | URL → Fact Sheet. Cache-first. `maxDuration = 60`. |
| `POST\|GET /api/lookup` | The `lookup_live` server tool + freshness stamp. 6s ceiling. |
| `POST /api/liveread` | Google listing → `LiveRead`. `maxDuration = 45`. |
| `POST /api/places` | Apify `compass~crawler-google-places`, run-sync. Cached. |
| `POST /api/geocode` | Nominatim. Never throws — a failed geocode skips the confirm step. |
| `POST\|GET\|PATCH /api/ring` | The demo line: ring, poll, answer/transcribe. |
| `GET /demo/[slug]` | Three fixture businesses, served with a mutable status line. |
| `GET /api/demo-status` | Stage control: flip a fixture site's status line from a phone. |

### Every failure returns a usable turn

There is no dead line anywhere. A `lookup_live` timeout returns `answer: null`
rather than an error, so the agent falls back to the cached sheet and says so. A
place with no website returns `"found it, but no website to read"`. A failed
geocode returns `null` and the confirm step is skipped. A stale poll id returns
`failed` rather than leaving a card ringing forever. Each string is written to be
speakable, because the agent reads it.

### Stack

Next.js 16 App Router on Vercel · React 19 · TypeScript strict, no `any` ·
zod 4 · `@elevenlabs/react` (`useConversation`, `useConversationClientTool`) ·
Supabase Postgres, four tables · OpenRouter, default
`google/gemini-3.1-flash-lite`, swappable by env · context.dev REST ·
Apify · Nominatim. Both API clients are raw `fetch`, no SDK.

### What is not built, so the diagrams aren't read as more than they are

- **No leg of this touches the PSTN.** `book_table` posts to `/api/ring`, which
  writes one row; the page at `/phone` polls it and rings. A human plays the
  restaurant. The outbound Twilio path was built and then deleted rather than
  left switched off — with no number provisioned it was a second path that could
  only fail, and deleting it is a stronger guarantee than an empty allowlist.
- **`/api/ring` holds one call.** One line, because a phone has one line. A
  second caller takes the line from the first.
- **The crawl response does not stream.** `POST /api/crawl` returns one JSON
  document. The console's progress log is client-side stage events plus an
  elapsed-second counter; `readEventStream` is a forward-compatible NDJSON branch
  the backend never currently triggers.
- **Live-lookup routing is keyword regex, not retrieval.** Four intents matched
  against sitemap paths. No embeddings, no vector store.
- **`when` is never parsed into a timestamp.** "Tomorrow at eight" is what the
  visitor said and what the Booker says. Parsing adds a failure mode and buys
  nothing when the other end is a human, not a calendar.
- **The refusal eval grades by substring and regex**, not an LLM judge.
- **No background re-crawls.** Both live tiers are on-demand only.
- **One agent per role, not multi-tenant.** Knowledge is swapped per conversation.

---

## 03 — Tool rationale

Each sponsor gets the same test: remove it, does the product still work? If yes,
the integration was decorative.

### ElevenLabs — three agents, and the thing that makes the canvas possible

| Agent | Role |
|---|---|
| **Concierge** | Runs the canvas at `/`. Owns all six client tools. |
| **Booker** | Answers the desk phone's WebRTC leg and books the table. |
| **Dial** | The receptionist at `/console`, answering *as* a business. |

Four capabilities are load-bearing, none of them text-to-speech:

- **Client tools.** The entire generative-UI mechanic is
  `useConversationClientTool` plus `sendContextualUpdate`. This is why the
  `<elevenlabs-convai>` unpkg embed was replaced by `@elevenlabs/react` on `/` —
  the embed cannot register client tools. Without this there is no canvas.
- **Server tools.** `lookup_live` is the entire first live tier. No mid-call
  webhook, no second knowledge tier.
- **Dynamic variables at conversation start.** The Fact Sheet reaches Dial, and
  the whole booking reaches the Booker before the phone rings, by the same
  injection path (`docs/adr/0002`). One agent serves any business with no
  knowledge-base upload and no index propagation wait — which is what makes
  "paste a URL, talk in 60 seconds" true rather than aspirational.
- **Interruption + mid-conversation language switching.** Callers talk over
  receptionists; an agent that finishes its sentence reads as a recording.
  English, Arabic, Hindi, Tagalog is the actual language mix of a Dubai SME's
  callers.

Agents are **provisioned from committed prompts** by
`scripts/setup-agents.mts`, idempotently — the prompt in git is the prompt in
production, and pushing an edit is re-running the script.

**Remove it:** this is a chatbot with a search box. The target market's customers
call.

### context.dev — load-bearing at three separate moments

| Moment | Call | Why nothing else does it |
|---|---|---|
| Onboarding | `POST /v1/web/crawl`, `useMainContentOnly: true` | Multi-page crawl to LLM-ready markdown, nav/footers/cookie banners dropped server-side. Most SME sites are JS-rendered — a plain `fetch` returns an empty shell. |
| Mid-call, own site | `GET /v1/web/scrape/markdown`, `maxAgeMs: 0` | An explicitly uncached read inside a 6-second conversational budget. `maxAgeMs: 0` is the whole point. |
| Mid-call, reputation | same, `useMainContentOnly: false` | Google's listing, for the rating and the live open/closed line. |
| Routing | `GET /v1/web/scrape/sitemap` | Points the live read at the page likely to hold the answer. |

**Remove it:** onboarding becomes a week of manual knowledge-base work, *and*
every answer is a stale cache, *and* the agent can't tell you what people think
of the place. It passes its own removal test three times over.

### Devin — parallel workstreams against a committed contract

Four people, one build window, three workstreams sharing one data shape. Devin
drove Voice, Data, and Frontend concurrently — and then the canvas pivot, which
is ~7,000 lines that landed in the back half of the day.

The steering is committed as artifacts, not claimed:

- `AGENTS.md` — the standing brief every session starts from: scope, ownership,
  the no-inference rule, the no-new-dependencies rule.
- `docs/agents/` — one file per session: the verbatim prompt, what came back,
  what had to be corrected. The corrections are the interesting part.
- `docs/superpowers/` — the canvas design doc and its 10-task implementation
  plan, written and approved before the pivot was built.
- `docs/adr/` — the four decisions that changed the build.

The rule we kept returning to: **an agent that cannot see the contract invents
one.** Every session was pointed at `lib/factsheet.ts` first. The drift tests
(`prompts/concierge.test.ts`, `prompts/system-prompt.test.ts`) exist because a
prompt and the code that fills it are two places for the same truth.

**Remove it:** four people ship one workstream in six hours, and the canvas
never happens.

### Why Apify, Nominatim, OpenRouter

**Apify** for Google Maps because the canvas needs a business's phone, website,
rating and coordinates from a spoken name — one actor, one latency profile, one
thing to tune. The area goes in the **search string, not `locationQuery`**:
`locationQuery` resolves colloquial names like "Jumeirah Lake Towers Dubai"
through Nominatim to a point of interest whose polygon is 0 km², so every result
is discarded as `outOfLocation` and the actor returns an empty list after 12
seconds. That cost us a real debugging cycle and the comment is in the code.

**Nominatim** for area confirmation because it is keyless, dependency-free and
sub-second. Its job is to let the visitor confirm the area *before* we spend
20–90 seconds in the Apify actor.

**OpenRouter** for every model call: one `fetch` to an OpenAI-compatible
endpoint, `temperature: 0`, and `OPENROUTER_MODEL` swaps models with no code
change — useful when extraction misbehaves at hour four and there is no time to
re-integrate a vendor client. The task is "copy this field or write null", the
only judgement the pass needs (`docs/adr/0004`).

---

## 04 — Feasibility: scoping to a six-hour window

Build window 8:30 AM – 2:30 PM GST. Cold start: no team, no tested keys, no
provisioned numbers at 8:30. Elapsed offsets, not wall clock.

| Window | Work |
|---|---|
| 0:00–0:25 | Team forms, everyone holds every key. Scaffold, **zod schema and fixture committed** before any implementation exists. |
| 0:25–0:50 | **Risk spike only.** Voice proves an agent answers from a hardcoded sheet; Data proves context.dev returns usable markdown for one real URL. Nothing else is built until both are green. |
| 0:50–2:30 | Three parallel workstreams: crawl + extraction, the receptionist prompt + refusal eval, the console. **Dial is demo-complete here.** |
| 2:30–3:00 | Canvas design doc written and approved, task plan committed. |
| 3:00–4:30 | The pivot, in the doc's build order: `@elevenlabs/react` swap and card reducer → `/api/places` + flow A → grid + `check_live` → `/api/ring` + `/phone` + flow B. |
| 4:30 | **Feature freeze.** Bug fixes only, enforced by the person holding merge rights. |
| 4:30–5:15 | Codebase pass: README, TECH-SPEC, ADRs, CI green, steering log collected. |
| 5:15–6:00 | Run-throughs, backup video on run two, Loom recorded, submission filed. |

### The five decisions that bought the time

**1. The pivot reused the core instead of replacing it.** The canvas is new
surface over machinery that already worked: `/api/crawl`, `/api/lookup`,
`factsheetToVariables()` and `FactSheetCard` are untouched. The Dial console was
**moved to `/console`, not deleted** — it is the receptionist demo in its own
right, and it was what a booking agent would have called had there been a number.

**2. A human answers the phone instead of Twilio** (the newest decision, and the
sharpest). A provisioned UAE number is a regulatory unknown with a hard
dependency on a third party answering on a Saturday, and an international number
on venue wifi with a phone on speaker is a failure class we chose not to have on
stage. `/api/ring` is one Supabase row and a polling page, and it demonstrates
every claim the number would. The outbound path was then deleted, not disabled:
an endpoint that turns model output into a phone call is a robodialer with extra
steps, and the safest version of it is the one that isn't in the repo.

**3. Browser widget over inbound number** (`docs/adr/0001`), for the same reason,
made at hour one.

**4. Dynamic variables over a knowledge base** (`docs/adr/0002`). A
knowledge-base upload means propagation delay, which kills the "paste and talk"
moment and adds an async state machine to debug. Flat strings at handshake are
synchronous and testable.

**5. Three hand-written fixture sites** (`demo-sites/`) with a status line we can
flip from a phone bookmark mid-call (`/api/demo-status`). This is how the live
tier gets *proven* rather than asserted: ask the agent, flip the line, ask again,
and the answer changes under it. They are deliberately not in `public/` — a
statically served copy would carry a frozen status line and quietly kill the
demo.

### Enforced non-goals

Auth, accounts, multi-tenant, payments, call history, analytics, background
re-crawls, saved bookings, calendar/CRM integration, more than one Apify actor,
parsing `when` into a timestamp, calling any number not on the allowlist, and
Devin anywhere in the runtime path. Written into `AGENTS.md` and PRD §4 so a
session at hour four could not quietly widen scope.

**Cut order, agreed in advance** so falling behind is a decision already made
rather than an argument at hour five: cut from the bottom of the canvas build
order — booking, then the restaurant grid, then flow A — leaving the Dial console
as a complete demo on its own. The live tier is the last thing to go; without it
this is the example project everyone else built.

### Where the extra capacity went

Not features. Two guarantees:

**The refusal guarantee.** 16 eval cases across two businesses, six of them
`expect: "refuse"`. `evals/grade.ts` fails a reply for any of nine banned hedges
("typically", "usually", "approximately"…), for quoting money on an uncovered
question, or for refusing without offering a callback. Two decisions fall out of
it: every unpublished field renders as `"not published on the site"`, never `""`,
because an empty string reads to a model as permission to improvise; and
`render()` **throws** on an unfilled placeholder rather than substituting empty,
because the alternative surfaces as `"{{hours}}"` spoken aloud on stage.

**Nothing dials.** The booking arguments come from a language model parsing
speech from whoever is holding the microphone on a public URL. There is no
endpoint that turns them into a phone call: `/api/ring` writes a row and `/phone`
reads it. The payload is still validated server-side in `lib/ring.ts`, because it
becomes what the Booker says out loud.

**95 unit tests across 14 files.** `typecheck` and `test` run in CI on every
push and need no API keys. `npm run smoke` is an end-to-end Playwright pass whose
voice leg self-skips when no agent id is configured.

---

## 05 — Extensibility: what v2 looks like

Not more features. The four things that make this a product rather than a demo.

**1. A real phone leg on both ends.** `/api/ring` becomes Twilio inbound — the
business's own number forwards to the Dial agent — and the outbound leg comes
back behind a number allowlist. What's missing is provisioning, per-tenant number
mapping, and the consent story for calling a business that never opted in.

**2. Multi-tenant provisioning.** Today one agent per role swaps knowledge per
conversation. v2 is agent-per-tenant, RLS on all four tables, and the
service-role Supabase client replaced. That ceiling is flagged in-code too.

**3. A freshness policy per fact type.** The split is currently binary — cached
sheet, or a live read triggered by keyword cues. It should be per-field, because
facts rot at different speeds: hours and prices re-read aggressively, addresses
and languages almost never, a promo banner or an open/closed line every single
time. That turns the live tier from a fallback into a policy and takes its
latency out of the common case.

**4. Retrieval instead of keyword routing.** `routeQuestion()` is four regexes.
The upgrade path, noted at the call site, is embedding the sitemap once at crawl
time and routing by similarity — which also removes the sitemap round-trip from
every live lookup.

Then, in order: real calendar/CRM integration on the restaurant end; a crawl-diff
digest, since the cache and a fresh read are already comparable and "your site
changed, your agent noticed" is a product; call transcripts and analytics; and an
LLM judge in the eval harness once phrasing false-failures cost more than they
catch.

**Known ceilings are marked in-code.** Every deliberate shortcut carries a
`ponytail:` comment naming the ceiling and the upgrade path — the single
single unlocked phone line, the service-role Supabase client, the module-level
`lastFetchedAt` that only sees lookups landing on one serverless instance,
keyword routing, the never-throwing geocoder, the substring grader, and the
writing `GET` at `/api/demo-status` that exists so a stage flip is one tap from a
phone bookmark.
