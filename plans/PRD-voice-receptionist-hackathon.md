# PRD: Dial — a phone line that answers from the website, as it is right now

**Event:** Dubai Voice Agents Hackathon
**Sponsors in scope:** ElevenLabs, Context.dev, Devin
**Build window:** 4.5 hours (270 min), cold start — teams form on the day
**Team size:** 4 (5th person slot pre-assigned, see §11)
**Stack:** Next.js on Vercel, Supabase Postgres, OpenRouter for extraction
**Status:** Locked. Changes after T+170 require Person 4 approval.

---

## 1. Problem

Small businesses in Dubai have a working website and a phone nobody answers. The owner is the switchboard. Calls come in five languages, after hours, asking the same six questions that are already published on the site.

AI receptionist products exist. None of them have reached the salon on Al Wasl Road, because onboarding costs a week of someone hand-building a knowledge base per customer — and the moment it's built, it starts going stale. Prices change, a branch closes, Friday hours shift for Ramadan, and the agent keeps confidently reciting last month's website.

Onboarding cost gets you to launch. Staleness is what kills you in month two.

## 2. Solution

Paste a business URL. Sixty seconds later a line answers as that business, in the caller's language, using only facts published on that site.

And when a caller asks something the cached facts don't cover — or something that looks time-sensitive — the agent goes and reads the site **mid-call**, then answers with a timestamp.

> *"Let me check their site… as of just now, they're open till 10 tonight."*

The crawl replaces onboarding. The live lookup replaces staleness. Both claims are demonstrable in one phone call.

## 3. What changed from v1, and why

The first version of this PRD crawled once at onboarding and never again. Three problems with that:

- **Context.dev fired once and was done.** A one-shot ingest is static data wearing a live costume. The brief asks for *live web data in*.
- **"Knows something real about the world" was a metaphor.** Now it's literal — the agent can be asked about something that changed today.
- **It was, verbatim, the example the organizers told us not to build.** The live tier is the part the other receptionist teams won't have.

Two more corrections: the browser widget is now the primary channel (a real UAE inbound number is a regulatory and stage-risk problem for marginal narrative gain), and codebase health is a scored deliverable with budgeted time rather than a hope (§12).

## 4. Non-goals

Explicitly out of scope. Do not negotiate these during the event.

- Multi-tenant. One agent, knowledge swapped per conversation.
- Auth, accounts, user management, billing.
- Booking, calendar, CRM, or payment integrations.
- Call transcripts, call history, analytics dashboards.
- Scheduled background re-crawls. Live lookup is on-demand only.
- More than two demo businesses.
- Devin anywhere in the runtime path.

Supabase is in scope for exactly one thing: a fact sheet cache. One table, no RLS, no auth. See §8.

## 5. Users

**Primary (demo persona):** SME owner. Salon, clinic, gym, garage, cargo agent. Has a website, no receptionist.

**Secondary (the caller):** Customer at 9pm asking about price, hours, location, or availability. Speaks English, Arabic, Hindi, or Tagalog.

**The judge:** Wants to see their own API doing something load-bearing, wants to verify the answer against the real site, and — per the brief — is reading the repo.

## 6. Sponsor integration

Each sponsor must be structurally necessary. If the product still works with one removed, the integration is decorative.

| Sponsor | Role | Removal test |
|---|---|---|
| **ElevenLabs** | Conversational agent. Multilingual, interruptible, low latency, server-tool calling. | Remove it and this is a chatbot nobody in the target market will use. |
| **Context.dev** | Crawls the site at onboarding **and** serves the mid-call live lookup. | Remove it and onboarding is a week of manual work *and* every answer is a stale cache. It is load-bearing at two separate moments. |
| **Devin** | Drives all three build workstreams in parallel. Prompts and session links are committed artifacts (§12). | Remove it and 4 people ship one workstream in 4.5 hours instead of three. |

## 7. Core flow

**Onboarding (once, ~60s):**

1. Operator pastes a URL.
2. Context.dev crawls the domain → markdown.
3. One LLM pass via OpenRouter compresses the crawl into a Fact Sheet (§8), validated against the zod schema. Model is swappable with `OPENROUTER_MODEL`.
4. Fact Sheet cached in Supabase, keyed by URL.
5. Screen renders the Fact Sheet and the "talk to it" button.

**Conversation (every call):**

6. Fact Sheet injected at conversation start as dynamic variables — instant, no index propagation wait.
7. Agent answers from the Fact Sheet for anything covered.
8. When the question is uncovered **or** time-sensitive (today, tonight, right now, still, currently), the agent calls the `lookup_live` server tool. Tool hits Context.dev against the source domain, returns a fresh snippet + source URL + fetch timestamp.
9. Agent answers, states the source and freshness out loud.
10. If neither tier has it, the agent refuses and offers a callback. It never guesses.

## 8. Data contract — the Fact Sheet

Agreed in the first ten minutes and committed **as code**, not as a whiteboard photo. `lib/factsheet.ts` exports a zod schema; every workstream imports it. A fixture (`fixtures/factsheet.example.json`) lands in the same commit so nobody blocks on anybody.

```ts
{
  business_name: string
  one_line: string
  services: { name: string; price: string | null; description: string }[]
  hours: string
  locations: { branch: string; address: string; phone: string | null }[]
  booking_policy: string | null
  languages_spoken: string[]
  escalation_note: string
  source_url: string
  crawled_at: string  // ISO8601
}
```

Rules:
- Nulls are allowed and expected. The agent handles missing fields gracefully.
- Prices are strings. Sites publish "from AED 150" and "on request".
- No field may be inferred. If it isn't on the site, it is null.
- Schema changes after T+20 require Person 4 approval and a message in the team channel.

**Supabase**, one table, no RLS, no auth:

```sql
create table factsheets (
  url         text primary key,
  data        jsonb not null,
  crawled_at  timestamptz not null default now()
);
```

Purpose: pre-crawled demo businesses survive venue wifi, and a re-demo is instant. That is the whole reason it exists. Nothing else goes in this database.

## 9. Agent behaviour

**Greeting:** Business name, then offer of help. Language detected from the caller's first utterance.

**Answering:** From the Fact Sheet. Concise, spoken register, no list-reading.

**Live lookup:** Triggered when the answer isn't in the Fact Sheet, or when the question contains a freshness cue. The agent narrates the wait — *"one second, checking their site"* — because 2–4 seconds of silence reads as a crash.

**Freshness disclosure:** After a live lookup, the agent states when it read the page. This is the demo's whole punchline. It goes in the system prompt, not left to chance.

**Refusal:** When neither tier has it, the agent says it will have someone call back. It never guesses, never estimates, never says "typically" about a price.

**Language:** Switches mid-conversation without being asked. English, Arabic, Hindi, Tagalog.

**Interruption:** Caller talks over the agent, agent stops.

The refusal rule is still the single most important line in the system prompt. A hallucinated price in front of a judge who has the website open is the worst outcome available.

## 10. Interface

One page on Vercel. Nothing else gets built.

- URL input, single action button
- Streaming crawl log — page count, titles as they land
- Rendered Fact Sheet
- **Talk** button → ElevenLabs widget, inline
- A small "last read: 14:32" stamp that updates when a live lookup fires

No navigation, no settings, no history, no dark mode debate.

**Channel decision:** browser widget is primary. A real inbound number is a stretch goal, attempted only after T+210 and only if everything else is green. UAE inbound provisioning carries regulatory friction, and an international number on venue wifi with a phone on speaker is a failure class we are choosing not to have on stage. Recorded in `docs/adr/0001`.

## 11. Team split

Everyone drives Devin. Devin is not one person's tool — it is the thing being judged.

| Person | Owns | Never touches |
|---|---|---|
| 1 — Voice | ElevenLabs agent, system prompt, dynamic variables, `lookup_live` tool wiring, language switching, latency | Web app |
| 2 — Data | Context.dev crawl, extraction pass, live-lookup endpoint, Supabase cache, demo businesses | Voice config |
| 3 — Frontend | The page, the widget embed, crawl log streaming | Backend logic |
| 4 — Glue & pitch | API layer, Vercel deploy, env plumbing, demo script, kill list | Feature scope creep |
| 5 (if assigned) | Eval harness, README, ADRs, submission artifacts | Anything on the critical path |

Person 4 holds merge approval after T+170 and is the only person who can approve additions. If no fifth person joins, §12 is Person 4's second job and the phone-number stretch goal is dead on arrival.

## 12. Codebase health — a scored deliverable

The brief says they are judging the codebase and how well we steer the tools, not just whether the demo works. This section is not optional polish; it has budgeted time in §13.

- Repo live from minute 0. One PR per workstream into `main`. Readable commit messages.
- **`AGENTS.md` at root, plus every Devin prompt committed under `docs/agents/`.** This is the steering evidence. It does not live in Slack.
- Typed contract: `lib/factsheet.ts` zod schema imported by all three workstreams. The contract is code.
- Tests, ~8 of them: schema parse against 3 real crawl fixtures, a refusal-eval harness (question → expect answer / expect refusal), one e2e smoke.
- CI on push: typecheck + test. Fifteen minutes of setup for a green badge on the repo the judges open.
- README: architecture diagram, the removal-test table from §6, and a "how we steered the agents" section.
- `docs/adr/` — four entries maximum, one per real decision: widget vs phone, dynamic variables vs knowledge base, live tool vs crawl-only, extraction approach.
- `.env.example` committed. No keys in git, ever.

## 13. Timeline — 270 minutes, cold start

Assume nothing exists at T+0. No pre-purchased numbers, no pre-tested keys, no team.

| Window | Work |
|---|---|
| **0–20** | Team forms. Every person has every key in hand before anything else starts. Repo scaffold, zod schema, fixture committed. |
| **20–40** | **Risk spike only.** Person 1 proves a voice agent answers from a hardcoded fact sheet. Person 2 proves Context.dev returns usable markdown for one real URL. Nothing else is built until both are green. |
| **40–120** | Three Devin-driven workstreams. PRs into `main`. |
| **T+120 — Checkpoint 1** | Real crawl → real conversation, end to end. **If red:** cut the frontend to a terminal log and move Person 3 onto voice. |
| **120–170** | `lookup_live` tool working mid-call. Refusal eval passing. Language switch verified. |
| **T+170 — Feature freeze** | Hard stop. Bug fixes only past this line. |
| **170–210** | Codebase pass: README, ADRs, tests green, CI green, Devin session links collected, submission form filled. |
| **210–250** | Four clean run-throughs, all hands. Backup video recorded on run two. |
| **250–270** | No commits. Pitch only. |

**Cut order if behind at T+120:** frontend polish → second demo business → language switching → live lookup. Live lookup is the last thing to go; without it we are the example idea.

## 14. Quality bar

Extra capacity goes here, not into features.

Eight questions per demo business, two businesses. Sixteen total, all verified. Three questions answered perfectly beats five things half-working.

Pass criteria:
- Correct answer on every price and hours question, both businesses
- Clean refusal on at least three out-of-scope questions
- **At least one live lookup that returns something the cached Fact Sheet does not contain**, with the timestamp spoken aloud
- Language switch works mid-conversation on every attempt
- Paste → talking in under 90 seconds

## 15. Demo script

1. Frame the problem in fifteen seconds: every AI receptionist needs a week of onboarding, and it's stale the week after. That's why none of them reached the salon on Al Wasl Road.
2. Take a business from the audience — only if the first two rehearsal runs were clean. Otherwise use a pre-picked one and say so plainly.
3. Paste the URL. Talk over the crawl log while it streams.
4. Fact Sheet renders. Point at two facts the audience can see on the site behind you.
5. Talk to it. Price question in English. Switch to Arabic mid-sentence.
6. **Ask something that isn't in the Fact Sheet but is on the site.** Let the audience hear it go and read the page, and say when it read it. This is the moment the demo is built around.
7. Ask something that's nowhere on the site. Let it refuse.
8. Close on onboarding cost + staleness, then thirty seconds on the repo: the contract, the eval harness, the Devin sessions.

Two people on stage. Person 4 talks, Person 1 drives. The other two sit down.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Venue wifi fails during live crawl | Two businesses pre-crawled into Supabase. Paste a cached one, say nothing. |
| Live lookup is slow or times out on stage | 6s timeout, agent falls back to the Fact Sheet and says so. Never a dead line. |
| Live conversation fails on stage | Clean recorded run as backup video. Play it, don't apologise, keep talking. |
| Crawl returns nav junk and cookie banners | Extraction pass is budgeted work, not an afterthought. Fixtures from real sites. |
| Target site is JS-rendered and crawls to nothing | Both demo businesses verified crawlable at T+40. A site that fails the crawl is not a demo business. |
| Agent hallucinates a price | Hard refusal rule in the prompt, verified against the 16-question set. |
| Dynamic variables don't work as expected | Verified in the T+20 spike. Fallback is knowledge-base push, accepting propagation delay and dropping the "60 seconds" claim to "under two minutes". |
| Feature creep at hour three | Person 4 owns the kill list and has the final word. |
| Codebase work gets squeezed out | It has its own 40-minute block after feature freeze, and the freeze is enforced by the person holding merge rights. |

## 17. Open items to confirm in the T+20 spike

- ElevenLabs: dynamic variables at conversation start, and server-tool (webhook) calling from within a conversation
- Context.dev: crawl depth, rate limits, and per-request latency on the event plan — the last one gates the live tier
- Whether audience-suggested URLs are permitted under the demo rules

## 18. Post-hackathon note

If this gets traction, the next build is not more features. It's multi-tenant provisioning plus a freshness policy per fact type — hours and prices re-read often, addresses rarely. Booking integration comes third.
