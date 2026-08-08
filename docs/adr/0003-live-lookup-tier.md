# 0003 — A live lookup tier, not a crawl-once cache

**Status:** accepted
**Date:** 2026-08-08

## Context

The first version of this build crawled the site once at onboarding and answered
from that snapshot forever. Three problems:

1. The brief asks for *live web data in*. A one-shot ingest is static data in a
   live costume, and a judge will ask.
2. Staleness — not onboarding cost — is what makes a real customer churn in
   month two. Prices move, branches close, Friday hours shift for Ramadan.
3. "Paste a URL, get a voice assistant" is verbatim the example the organizers
   gave and then told us not to build. Something has to be different.

## Decision

Two tiers. The cached Fact Sheet answers anything it covers, at conversation
latency. A `lookup_live` server tool (`app/api/lookup/route.ts`) re-reads the
site mid-conversation when the question is uncovered or time-sensitive, and the
agent states out loud when it read the page.

## Consequences

- Context.dev becomes load-bearing at two separate moments instead of one. It
  passes its own removal test twice.
- Live lookups cost 2–4 seconds of silence, so the agent narrates the wait.
  Unnarrated latency reads as a crash.
- A timeout must never produce a dead line: past 6 seconds the tool returns
  `answer: null` and the agent falls back to the cached sheet and says so.
- This is the last thing to cut if we fall behind. Without it we are the example
  idea with better packaging.
