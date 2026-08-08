# PRD: Dial — URL to live phone agent in 60 seconds

**Event:** Dubai Voice Agents Hackathon
**Sponsors in scope:** ElevenLabs, Context.dev, Devin
**Build window:** 5 hours
**Team size:** 4
**Status:** Locked. Changes after T+150 require Person 4 approval.

---

## 1. Problem

Small businesses in Dubai have a working website and a phone nobody answers. The owner is the switchboard. Calls come in five languages, after hours, asking the same six questions that are already published on the site.

AI receptionist products exist. None of them have reached the salon on Al Wasl Road, because onboarding costs a week of someone hand-building a knowledge base per customer. Onboarding cost, not voice quality, is the reason this category hasn't spread down-market.

## 2. Solution

Paste a business URL. Sixty seconds later a phone number answers calls as that business, in the caller's language, using only facts published on that site.

The crawl replaces onboarding. That is the entire product claim.

## 3. Non-goals

Explicitly out of scope for this build. Do not negotiate these during the event.

- Multi-tenant. One agent, one number, knowledge swapped at runtime.
- Number provisioning per business.
- Booking, calendar, CRM, or payment integrations.
- Call transcripts, call history, analytics.
- Auth, accounts, database, billing.
- Scheduled re-crawls or freshness monitoring.
- More than one business vertical in the demo.
- Devin anywhere in the runtime path.

## 4. Users

**Primary (demo persona):** SME owner. Salon, clinic, garage, cargo agent. Has a website, no receptionist.

**Secondary (the caller):** Customer phoning at 9pm asking about price, hours, location, or whether a service is offered. Speaks English, Arabic, Hindi, or Tagalog.

**The judge:** Wants to see their own API doing something load-bearing, and wants to verify the answer is real.

## 5. Sponsor integration

Each sponsor must be structurally necessary. If the product still works with one removed, the integration is decorative.

| Sponsor | Role | Removal test |
|---|---|---|
| ElevenLabs | Conversational agent on a real phone number. Multilingual, interruptible, low latency. | Remove it and this is a chatbot nobody in the target market will use. |
| Context.dev | Crawls the site into clean, LLM-ready structured data. This is the onboarding step. | Remove it and onboarding returns to a week of manual work, which is the problem being solved. |
| Devin | Builds the frontend and the crawl-cleanup script in parallel with human workstreams. Session recorded for the pitch. | Remove it and the team ships one workstream instead of three in five hours. |

## 6. Core flow

1. Operator pastes a URL into a single input.
2. Context.dev crawls the domain and returns page content as markdown.
3. A single LLM pass compresses the crawl into the Fact Sheet (schema below).
4. Fact Sheet is pushed into the ElevenLabs agent's knowledge base, replacing prior content.
5. Screen displays the extracted Fact Sheet and the phone number.
6. Caller dials. Agent greets as the business, answers from the Fact Sheet only, switches language on cue.

## 7. Data contract — the Fact Sheet

Agreed on the whiteboard in the first ten minutes. Person 2 produces it, Person 1 consumes it, Person 3 renders it. All three build against a hardcoded example file so nobody blocks.

```json
{
  "business_name": "string",
  "one_line": "string",
  "services": [
    { "name": "string", "price": "string|null", "description": "string" }
  ],
  "hours": "string",
  "locations": [
    { "branch": "string", "address": "string", "phone": "string|null" }
  ],
  "booking_policy": "string|null",
  "languages_spoken": ["string"],
  "escalation_note": "string",
  "source_url": "string",
  "crawled_at": "ISO8601"
}
```

Rules:
- Nulls are allowed and expected. The agent must handle missing fields gracefully.
- Prices are strings, not numbers. Sites publish "from AED 150" and "on request".
- No field may be inferred. If it isn't on the site, it is null.

## 8. Agent behaviour

**Greeting:** Business name, then offer of help. Language detected from the caller's first utterance.

**Answering:** Only from the Fact Sheet. Concise, spoken register, no list-reading.

**Refusal:** When the answer isn't in the Fact Sheet, the agent says it will have someone call back. It never guesses, never estimates, never says "typically" about a price.

**Language:** Switches mid-conversation without being asked. English, Arabic, Hindi, Tagalog.

**Interruption:** Caller can talk over the agent. The agent stops.

This refusal rule is the single most important line in the system prompt. A hallucinated price in front of a judge who is looking at the website is the worst outcome available.

## 9. Interface

One page. Nothing else gets built.

- URL input and a single action button
- Streaming crawl log — page count, page titles as they land
- Rendered Fact Sheet
- Phone number in large type

No navigation, no settings, no history, no dark mode debate.

## 10. Team split

| Person | Owns | Never touches |
|---|---|---|
| 1 — Voice | ElevenLabs agent, number, system prompt, language switching, latency | Web app |
| 2 — Data | Context.dev crawl, cleanup pass, cached demo businesses, QA question set | Voice config |
| 3 — Frontend | The page, driven via Devin, session recorded | Backend logic |
| 4 — Glue and pitch | API layer, deploy, demo script, kill list enforcement | Feature scope creep |

Person 4 holds commit access after T+240 and is the only person who can approve additions.

## 11. Timeline

**T-minus (during opening remarks):** Number purchased, ElevenLabs agent created and answering, knowledge base update path confirmed via API, Context.dev key tested against one real crawl. If telephony isn't proven before the clock starts, hour one is lost.

**T+0 to T+10:** Fact Sheet schema on the whiteboard. Hardcoded example file committed. Three workstreams start.

**T+60 — Checkpoint 1:** End to end path works with a hardcoded Fact Sheet. A call is answered correctly. If not met: cut the frontend to a terminal log, move Person 3 onto voice.

**T+60 to T+150:** Real crawl feeding real calls. Cleanup pass tuned against three businesses. Language switching working. Agent refusal behaviour verified.

**T+150 — Checkpoint 2:** Feature freeze on voice and data. Only bug fixes past this point.

**T+150 to T+210:** Frontend polish. Devin session recorded. Cached demo businesses locked.

**T+210 — Checkpoint 3:** Full run-through together, all four people, from paste to hangup.

**T+240 to T+300:** Rehearsal only. Four clean runs minimum. Two of them on venue wifi with the phone on speaker. No commits in the last thirty minutes.

## 12. Quality bar

Extra team capacity goes here, not into features.

Person 2 builds twenty questions per demo business and confirms the agent answers each correctly. Three questions answered perfectly beats five things half-working.

Pass criteria:
- Correct answer on all price and hours questions for the three demo businesses
- Clean refusal on at least three out-of-scope questions
- Language switch works mid-call on every attempt
- Time from paste to answering call under 90 seconds

## 13. Demo script

1. Frame the problem in fifteen seconds. Every AI receptionist needs a week of onboarding. That's why none of them reached the salon on Al Wasl Road.
2. Take a business from the audience — only if the first two rehearsal runs were clean. Otherwise use a pre-picked one and say so plainly.
3. Paste the URL. Talk over the crawl log while it streams.
4. Fact Sheet renders. Point at two facts the audience can see on the site behind you.
5. Call the number on speaker. Ask a price question in English. Switch to Arabic mid-sentence. Ask something not on the site and let the agent refuse.
6. Close on the onboarding cost claim and what a real deployment looks like.

Two people on stage. Person 4 talks, Person 1 drives. The other two sit down.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Venue wifi fails during live crawl | Three businesses pre-crawled and cached. Paste a cached one, say nothing. |
| Live call fails on stage | Clean recorded call as backup video. Play it, don't apologise, keep talking. |
| Crawl returns nav junk and cookie banners | The cleanup pass is a full budgeted hour, not an afterthought. |
| Agent hallucinates a price | Hard refusal rule in system prompt, verified against the twenty-question set. |
| Telephony setup eats hour one | Proven before the clock starts. Non-negotiable. |
| Three different data shapes at hour four | Fact Sheet contract fixed at T+10, everyone builds against the same example file. |
| Feature creep at hour three | Person 4 owns the kill list and has the final word. |

## 15. Open items to confirm at kickoff

- ElevenLabs knowledge base update mechanism and propagation delay after an API update
- Context.dev crawl depth and rate limits on the plan available at the event
- Inbound number availability and any UAE-specific telephony constraint
- Whether audience-suggested URLs are permitted under the demo rules

## 16. Post-hackathon note

If this wins or gets traction, the next build is not more features. It is multi-tenant provisioning plus scheduled re-crawls, because staleness is the first thing a paying customer will complain about. Booking integration comes third.
