-- Community-shared video reviews (TikTok/YouTube/Facebook links attached to a place).
-- Public, no-auth read/write to match the app's current no-login model — anyone can
-- share a review link and anyone can see all reviews, same as the prior SQLite version.
create table if not exists public.video_reviews (
  id uuid primary key default gen_random_uuid(),
  video_url text not null,
  platform text not null,
  embed_html text,
  thumbnail_url text,
  place_name text,
  address text,
  lat double precision,
  lng double precision,
  google_place_id text,
  created_at timestamptz not null default now()
);

create index if not exists video_reviews_google_place_id_idx on public.video_reviews (google_place_id);
create index if not exists video_reviews_created_at_idx on public.video_reviews (created_at desc);

alter table public.video_reviews enable row level security;

create policy "video_reviews_public_select" on public.video_reviews
  for select using (true);

create policy "video_reviews_public_insert" on public.video_reviews
  for insert with check (true);

create policy "video_reviews_public_delete" on public.video_reviews
  for delete using (true);
