# 0002 — Fact Sheet ships as dynamic variables, not a knowledge-base push

**Status:** proposed — confirm in the T+20 spike
**Date:** 2026-08-08

## Context

The headline claim is "paste a URL, talk to it sixty seconds later." That number
is only true if the agent can see the new facts immediately.

Pushing the Fact Sheet into the ElevenLabs knowledge base means an indexing step
with a propagation delay we do not control and cannot measure until we try it.
Building the demo's central claim on an unmeasured async step is the kind of
risk that surfaces at hour four.

## Decision

Inject the Fact Sheet as dynamic variables at conversation start. It is
synchronous, it is per-conversation, and it makes swapping businesses instant —
which is also what makes a single agent serve every demo without provisioning.

## Consequences

- The Fact Sheet must fit in the prompt, which caps how much of a site we can
  carry. That cap is why the live lookup tier exists at all, so the constraint
  is load-bearing rather than a limitation.
- Nested arrays have to be flattened to strings before the call —
  `factsheetToVariables()` in `lib/factsheet.ts`.
- **If the spike shows dynamic variables don't work as expected:** fall back to
  the knowledge base, accept the propagation delay, and change the claim from
  "sixty seconds" to "under two minutes". Change the pitch, not the demo.
