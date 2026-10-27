-- A cache Edge Functions share for slow third-party searches (TikTok
-- discovery first). One traveller's search serves everyone after them and
-- spends no more Serper credits: before this every browser repeated the full
-- Google + oEmbed round, up to ~30 s, behind only its own localStorage cache.
--
-- Written and read only by Edge Functions with the service role; RLS is on
-- with no policies, so the API never exposes it to the browser.

create table if not exists public.search_cache (
  key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.search_cache enable row level security;
revoke all on public.search_cache from anon, authenticated;

comment on table public.search_cache is 'Server-side cache of third-party search results (Edge Functions only, service role).';

select cron.schedule('ft-purge-search-cache', '30 19 * * *', $$delete from public.search_cache where expires_at < now() - interval '1 day'$$);  -- 02:30 in Vietnam
