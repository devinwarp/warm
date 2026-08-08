-- Same shape and same purpose as factsheets: the demo survives venue wifi and
-- a re-run is instant. Nothing else goes in here.
--
-- The Apify Google Maps actor runs 20-90s cold. A cache hit is the demo path;
-- a miss must still work, and the agent narrates the wait either way.
create table if not exists places (
  key         text primary key,   -- lower("<query>|<area>")
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);
