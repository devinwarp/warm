# Agent instructions

Read this before writing code. It applies to Devin, Claude Code, and anyone
reviewing what they produced.

## What this is

Dial answers a business's phone line from its own website — cached facts for
speed, a live re-read of the site mid-conversation for anything time-sensitive.
Product spec: `plans/PRD-voice-receptionist-hackathon.md` — §7 (core flow) and
§8 (data contract) are the parts still worth reading before your first edit.

## Ground rules

- **The Fact Sheet is the contract.** `lib/factsheet.ts` is imported by the
  crawl, the prompts and the UI alike. Do not widen, narrow, or "fix" the
  schema to make your own code compile. If it genuinely needs to change, raise
  it and get agreement first.
- **TypeScript strict, no `any`.** If a type is hard, the shape is probably wrong.
- **Never infer a fact.** If the site didn't publish it, the field is `null`
  and the agent refuses. A plausible-sounding price is the worst bug in this
  codebase, not a small one.
- **Every unpublished field renders as `NOT_PUBLISHED`, never `""`.** Empty
  strings read to the model as permission to improvise.
- **No new dependencies** without asking. Node stdlib, then what's installed.

## Scope

Do not build: auth, accounts, multi-tenant, calendar, payments, call history,
analytics, background re-crawls, dark mode. PRD §4 is the full list; treat it as
settled unless there is a reason on the record to reopen it.

Booking *was* on that list. It is now built, deliberately and with a design doc
— see `docs/superpowers/specs/2026-08-08-voice-canvas-design.md`. That is the
only scope change, and it took an approved spec to make it.

Supabase holds four tables and nothing durable: the fact sheet cache, the places
cache, the demo status line, and the phone line (`calls`, one row, shared state
because the ring and the answer are separate requests). Nothing that isn't a
cache or transient demo state goes in it.

## Working shape

- One PR per change into `main`. Small commits, real messages.
- `npm run typecheck && npm test` must pass before you open the PR.
- Leave a `ponytail:` comment on any deliberate shortcut, naming the ceiling
  and the upgrade path — see `lib/supabase.ts` for the pattern.
- Non-trivial logic leaves one runnable check behind. Not a suite. One test
  that fails if the logic breaks.

`docs/agents/` is a historical record of the sessions that built this, kept for
context. Adding to it is optional, not a requirement of shipping.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
