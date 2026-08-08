# Design: the voice canvas

**Status:** approved 2026-08-08
**Supersedes:** the landing page described in PRD §10. Everything else in the PRD stands.
**Related:** `docs/adr/0001` (widget over phone number), `docs/adr/0002` (dynamic variables), `docs/adr/0003` (live lookup tier)

---

## 1. What changes

Today `/` is the Dial console: paste a business URL, watch it crawl, talk to an agent that
answers **as** that business.

This design adds a second, larger product on top of the same machinery. `/` becomes a voice
canvas: the visitor clicks once, speaks, and an agent works **for** them — finding a business,
reading its site, searching for restaurants, and placing a real phone call to book a table.

The Dial console is not deleted. It moves to `/console`, and its agent gets a second job (§4).

Two use cases, in build order:

**A — Business lookup.** *"Tell me about Ruwaya Hair Studio on Al Wasl Road."* The agent finds
the place, shows candidate cards, asks the visitor to confirm, crawls the confirmed site, renders
the Fact Sheet, and converses about it.

**B — Restaurant booking.** *"Find me Lebanese food in JLT."* The agent confirms the area on a
map card, scrapes restaurants, renders them as cards, asks which one and for the booking details,
then places an outbound Twilio call that books the table by voice.

## 2. The mechanic

The page and the conversation are two halves of one loop.

- **Agent → page:** the agent calls a *client tool*. The handler appends a card to the canvas
  and returns a one-line string to the agent describing what it just showed.
- **Page → agent:** the visitor taps a card. The handler calls
  `conversation.sendContextualUpdate(...)`, which lands in the conversation as context the agent
  reads on its next turn.

Client tools return **immediately**. None of them block waiting for a click — a tool that waits
on a human hangs the conversation if the human never taps. Confirmation always arrives as a
contextual update, never as a tool return value.

This requires `@elevenlabs/react` (`useConversation`, `useConversationClientTool`). The current
`<elevenlabs-convai>` unpkg embed cannot register client tools and is replaced on `/`. `/console`
keeps the embed unchanged.

## 3. Agents

| Agent | Role | Status |
|---|---|---|
| **Concierge** | Runs the canvas. Owns all five client tools. | new |
| **Booker** | Outbound Twilio call. Plays the customer, books the table. | new |
| **Host** | Answers the demo number as the restaurant. | **the existing Dial agent, unchanged** |

The Host row is deliberate. Rather than build a third agent to play the restaurant, the demo
number routes to the Dial agent already in this repo, primed with a Fact Sheet for the demo
restaurant. Dial's receptionist answers Dial's booking bot. It costs no new code, and it is why
`/console` survives.

## 4. Client tools

All five live in `app/canvas.tsx`, registered via `useConversationClientTool`. Each appends a
card and returns a short spoken-register string.

| Tool | Parameters | Does | Returns to agent |
|---|---|---|---|
| `find_business` | `name`, `locality?` | `POST /api/places` | `"found 2 — top is Qamar Table, JLT, qamartable.ae"` |
| `confirm_business` | `index` | `POST /api/crawl` on that candidate's website | the Fact Sheet summary, same shape the console logs |
| `resolve_area` | `locality` | renders an area card with a map | `"showing JLT on screen — ask them to tap it if that's right"` |
| `search_restaurants` | `cuisine`, `area` | `POST /api/places` | `"6 Lebanese places in JLT, top 3: …"` |
| `book_table` | `index`, `party_size`, `when`, `customer_name`, `customer_phone` | `POST /api/book` | `"calling them now"` |

`find_business` and `search_restaurants` hit the same endpoint with different queries. One Apify
actor, one latency profile, one thing to tune.

**Missing parameters are the agent's problem, not the UI's.** If the visitor has not given a
party size, the agent asks for it before calling `book_table`. No form ever appears.

## 5. Cards

Five presentational components. State is one `useReducer` holding an append-only `Card[]`.

| Card | Rendered by | Interaction |
|---|---|---|
| `CandidateCard` | `find_business` | tap → `"the visitor picked Qamar Table"` |
| `FactSheetCard` | `confirm_business` | **existing component, reused unchanged** |
| `AreaCard` | `resolve_area` | tap → `"the visitor confirmed the area"` |
| `RestaurantGrid` | `search_restaurants` | tap → `"the visitor picked #3, Al Nafoorah"` |
| `CallCard` | `book_table` | none — live status and transcript |

A tap never calls a tool directly. It sends a contextual update and the agent decides what to do
next — so tapping a candidate leads to `confirm_business`, but only after the agent has said it
is going to read the site. This keeps the voice ahead of the screen instead of narrating it
after the fact.

`CallCard` polls `GET /api/book?id=<conversation_id>` and streams the booking call's transcript
in as it happens. This is the demo's closing shot: the audience watches one agent talk to another
and come back with a table.

## 6. Server routes

| Route | Purpose |
|---|---|
| `POST /api/places` | Apify `compass~crawler-google-places`, run-sync. Body `{query, area?, limit}` → `Place[]`. |
| `POST /api/book` | Validates, then `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call`. |
| `GET /api/book?id=` | Proxies the ElevenLabs conversation API for status + transcript. |
| `POST /api/crawl` | **unchanged** |
| `POST\|GET /api/lookup` | **unchanged** |

No `twilio` npm package. Twilio credentials live inside the ElevenLabs phone-number import, done
once in their dashboard, so the entire outbound leg is a single authenticated fetch. Booking
details reach the Booker agent through `conversation_initiation_client_data.dynamic_variables`,
the same injection path `factsheetToVariables()` already uses.

## 7. The guardrail

`/api/book` **must** reject any `to_number` outside an allowlist read from
`DEMO_BOOKING_NUMBERS`, before any outbound request is made.

A voice agent on a public URL that can dial arbitrary numbers is a robodialer. Validation happens
server-side because the client tool's arguments come from a language model parsing speech from
whoever is holding the microphone. This is a trust boundary and it is not simplified away.

Party size and phone-number format are validated in the same place, in `lib/booking.ts`, with a
unit test.

## 8. Data shapes

```ts
// lib/places.ts — normalized from the Apify actor's item shape
type Place = {
  name: string
  address: string
  phone: string | null      // E.164 where the actor gives it, else null
  website: string | null    // drives confirm_business; null candidates are unusable
  rating: number | null
  reviews: number | null
  categories: string[]
  lat: number
  lng: number
}
```

Same nullability discipline as the Fact Sheet: if the source did not publish it, it is `null`
and nothing infers it.

```ts
// lib/booking.ts
type BookingRequest = {
  restaurant_name: string
  to_number: string         // allowlist-checked
  party_size: number        // 1..20
  when: string              // spoken form, passed through verbatim
  customer_name: string
  customer_phone: string
}
```

`when` stays a string. "Tomorrow at eight" is what the visitor said and what the Booker should
say; parsing it to a timestamp adds a failure mode and buys nothing, since the Host is a human or
an agent, not a calendar.

## 9. Latency

Apify Google Maps runs take 20–90 seconds. That is the single largest risk in this design —
larger than Twilio, which is one fetch.

- `maxCrawledPlacesPerSearch: 6`
- Read-through Supabase cache keyed on `(query, area)`, reusing the existing `factsheets` table
  pattern in a second table
- Demo queries pre-warmed before the pitch
- The Concierge narrates the wait, exactly as the system prompt already makes it narrate
  `lookup_live`

A cache hit is the demo path. A cache miss must still work, and must still be narrated.

## 10. Failure handling

Every tool returns a usable turn. There is no dead line, matching the rule `/api/lookup` already
follows.

| Failure | Agent gets back | Visitor sees |
|---|---|---|
| Apify returns nothing | `"no matches — ask them to try a different area"` | empty-state card |
| Candidate has no website | `"found it, but no website to read"` | candidate card, crawl disabled |
| Crawl fails | the existing crawl error string | fault card |
| Outbound call fails | `"couldn't get the call out"` | fault card |
| Call rings out | poll surfaces `failed`/`no-answer` | `CallCard` shows it |

## 11. Environment

New, added to `.env.example`:

```
APIFY_TOKEN=
NEXT_PUBLIC_ELEVENLABS_CONCIERGE_AGENT_ID=
ELEVENLABS_BOOKER_AGENT_ID=
ELEVENLABS_AGENT_PHONE_NUMBER_ID=
DEMO_BOOKING_NUMBERS=            # comma-separated allowlist, E.164
```

`NEXT_PUBLIC_ELEVENLABS_AGENT_ID` keeps its current meaning and now serves `/console` and the
Host role.

## 12. Tests

Following the existing pattern — small, unit, no framework beyond vitest.

- `lib/places.test.ts` — Apify item → `Place`, against a committed fixture. Nullability held.
- `lib/booking.test.ts` — allowlist rejects an off-list number; party size bounds; malformed
  phone rejected. The security path.
- `lib/canvas.test.ts` — the card reducer: append, replace-in-place on a re-render, selection.
- `prompts/concierge.test.ts` — the tool names in the prompt match the names registered in
  `canvas.tsx`, mirroring how `system-prompt.test.ts` guards dynamic-variable drift today.

## 13. Conventions

`.claude/rules/frontend.md` mandates shadcn/ui and zustand. The existing codebase uses neither —
plain Tailwind and local hooks throughout. This design follows the existing code. The rules file
is the thing that is wrong and should be corrected to match.

## 14. Out of scope

- Auth, accounts, saved bookings, history
- Calendar or CRM integration on either end of the call
- Calling any number not on the allowlist
- More than one Apify actor
- Parsing `when` into a timestamp
- Mobile-specific layout beyond what Tailwind gives for free

## 15. Build order

Use case A is shippable without any of use case B. Build in this order so there is a working
demo at every checkpoint:

1. `@elevenlabs/react` swap, canvas shell, card reducer — nothing else works without it
2. `/api/places` + `find_business` + `confirm_business` → **use case A complete**
3. `resolve_area` + `search_restaurants` + the grid → the visitor can browse
4. `/api/book` + guardrail + `book_table` + `CallCard` → **use case B complete**
5. Cache, pre-warm, Host agent priming → stage-hardening

Cut from the bottom.
