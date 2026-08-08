# 0004 — One LLM extraction pass via OpenRouter, no SDK

**Status:** accepted
**Date:** 2026-08-08

## Context

A context.dev crawl returns markdown for up to 8 pages. The agent needs the
Fact Sheet shape in `lib/factsheet.ts`. Something has to get from one to the
other, and three approaches were on the table:

1. Hand-written parsers per site. Fast and exact for two demo businesses, and
   worthless for the third — it rebuilds the per-customer onboarding cost the
   product claims to remove.
2. A vendor SDK against one model provider. An extra dependency, and a model
   swap at hour four becomes an integration instead of an env change.
3. One prompted pass over the concatenated markdown, schema-validated.

The failure mode that matters is not a missed field. It is an invented one.

## Decision

One completion via OpenRouter's OpenAI-compatible endpoint, called with a plain
`fetch` in `lib/llm.ts`, `temperature: 0`, `response_format: json_object`. The
model is `OPENROUTER_MODEL`, defaulting to `google/gemini-3.1-flash-lite`.
Output goes through `FactSheetSchema.parse()` before it is trusted.

Constraints on the pass, all in `lib/crawl.ts`:

- **The prompt's only rule is "copy, never infer."** A price the site does not
  print is `null`; hours it does not list are `""`. An empty field is stated to
  be a correct answer.
- **`source_url` and `crawled_at` are set by us after the model returns**, never
  taken from its output. Provenance the agent reads out loud must not be
  something an LLM could hallucinate.
- **30k char budget, fact-bearing pages first.** `pagesToDocument()` ranks
  pricing/services/contact/hours paths ahead of the rest, because the tail is
  what truncation eats. Each page is labelled with its URL so a price on
  `/services` is not silently attributed to the homepage.

## Consequences

- Swapping models is an env var, not a diff. This is the point: if extraction
  misbehaves under time pressure, the fix is a redeploy.
- No SDK, so nothing to keep in version step with anything. Consistent with
  `lib/contextdev.ts`, which is also raw `fetch`.
- The task is reduced to "copy this field or write null", which is the only
  judgement a cheap model needs to make reliably — and cheap enough to re-crawl
  all afternoon.
- A schema-invalid response fails the request with a 502 the operator can read,
  rather than caching a malformed sheet.
- Truncation past 30k chars is silent. Acceptable for a small-business site;
  the upgrade path is per-field extraction over a retrieved subset.
- Extraction quality stays a real risk, so it is budgeted work with fixtures
  from real sites rather than an afterthought (PRD §16).
