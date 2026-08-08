# 01 — Data — Context.dev crawl (configurable level) + live lookup

**Session:** <add Devin session link>
**Driver:** Person 2

## Prompt

> Look at the PRD understand the core flow, work on a plan to work on the API
> that captures information using context.dev, all data handling part need to
> be completed using this plan, other members are working on the front-end,
> voice integration etc.

Follow-ups during planning:

> can we make the level of crawling configurable?
> dont use ANTHROPIC API, we use open router, update the plan considering latest pull

## What came back

- `lib/contextdev.ts` — raw-fetch client (no SDK): `scrapeMarkdown`
  (useMainContentOnly), `crawlSite` (maxPages/maxDepth), `sitemapUrls`.
- `lib/crawl.ts` reworked: plain fetch + regex HTML stripping replaced with
  Context.dev; crawl level configurable per request (`maxPages`/`maxDepth` on
  the POST body, clamped 1–20 / 0–3) with env defaults
  `CRAWL_MAX_PAGES`/`CRAWL_MAX_DEPTH`; multi-page concat prioritises
  pricing/services/contact pages under the 30k-char cap.
- `lib/lookup.ts` — the live tier: keyword-routes the question to a likely
  page via the sitemap (1.5s sub-budget, best-effort), scrapes that page,
  answers via OpenRouter with a strict answer-only-from-page prompt;
  NOT_FOUND throws into the route's existing `answer: null` fallback.
- Tests: contextdev client (mocked fetch), crawl level + page concat,
  lookup routing + NOT_FOUND path. 29 tests green.

## What we corrected

- First plan draft used the Anthropic API directly for extraction — corrected
  to the repo's single OpenRouter provider (`lib/llm.ts`) after the pull that
  landed it.
- Plan was written against a stale tree; re-planned after `git pull` brought
  in `lib/crawl.ts`/`lib/llm.ts` so the work extended them instead of
  duplicating them.
- Flagged: `.env.example` had a real-looking `CONTEXT_API_KEY` committed —
  blanked in this session; the key should be rotated.
