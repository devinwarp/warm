# 0001 — Browser widget is the primary channel, not a phone number

**Status:** accepted
**Date:** 2026-08-08

## Context

The product is a phone line that answers. The obvious build is a real inbound
number the judges can dial from the room.

UAE inbound numbers carry regulatory friction that we cannot clear inside a
4.5-hour window. The fallback — a US or UK number — means international dialling
over venue wifi or cellular, on speaker, on stage. That is a failure class with
no recovery: if the call doesn't connect, there is no demo.

## Decision

The ElevenLabs browser widget is the primary channel. It runs over the same
agent, the same system prompt, the same tools, and it demos identically from a
laptop already connected to the projector.

A real number is a stretch goal, attempted only after T+210 and only if
everything else is green.

## Consequences

- One less failure mode on stage, and no dependency on venue cellular.
- The pitch says "phone line" while the demo shows a browser. We say so plainly
  rather than implying a number exists — a judge who spots the gap costs more
  than the gap itself.
- Telephony is a paragraph in the post-hackathon note, not a build task.
