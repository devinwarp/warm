-- The demo phone line. /api/ring writes the row, /phone reads it and rings.
--
-- One row, always keyed 'demo': a phone has one line. It lives here rather
-- than in a module variable because the two ends are separate requests, and on
-- Vercel they are not guaranteed to land on the same server instance — an
-- in-memory line means a phone that sometimes never rings.
create table if not exists calls (
  line     text primary key,   -- always 'demo'
  data     jsonb not null,     -- the Call in lib/ring.ts
  rang_at  timestamptz not null default now()
);
