-- The one mutable thing about the fixture businesses: the dated line at the top
-- of each page. Flipping a row here is the whole live-tier demo — the agent
-- re-reads the site mid-call and the answer changes under it.
--
-- A row per site, written by /api/demo-status, read by /demo/[slug]. Absent row
-- means the site has never been flipped and shows its fallback preset.
create table if not exists demo_status (
  slug        text primary key,   -- ruwaya | qamar | meridian
  preset      text not null,      -- key into SITES[slug].presets
  updated_at  timestamptz not null default now()
);
