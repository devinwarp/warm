-- Fact sheet cache. Pre-crawled demo businesses survive venue wifi, and a
-- re-demo is instant. That is the only reason this table exists.
create table if not exists factsheets (
  url        text primary key,
  data       jsonb not null,
  crawled_at timestamptz not null default now()
);

-- ponytail: no RLS, no auth, no user data. Reached only by the server-role
-- key from lib/supabase.ts. Enable RLS on the first multi-tenant commit.
