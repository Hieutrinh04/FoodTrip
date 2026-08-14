-- Newsletter signup: public can submit an email, but nobody (other than the
-- project owner via the dashboard/service_role) can read the list back —
-- unlike video_reviews, this is personal contact info, not community content.
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

create policy "newsletter_public_insert" on public.newsletter_subscribers
  for insert with check (true);

-- Saved places: personal per-account bookmark list. Requires a real login
-- (auth.uid()) so it can follow the user across devices — before this, it
-- only lived in localStorage.
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create index if not exists saved_places_user_id_idx on public.saved_places (user_id);

alter table public.saved_places enable row level security;

create policy "saved_places_owner_select" on public.saved_places
  for select using (auth.uid() = user_id);

create policy "saved_places_owner_insert" on public.saved_places
  for insert with check (auth.uid() = user_id);

create policy "saved_places_owner_delete" on public.saved_places
  for delete using (auth.uid() = user_id);

-- Custom food-wheel items: one row per user, replacing the localStorage
-- ft_food_wheel_items_v1 key so a custom wheel follows the account instead
-- of being trapped on one browser.
create table if not exists public.user_wheel_items (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_wheel_items enable row level security;

create policy "user_wheel_items_owner_select" on public.user_wheel_items
  for select using (auth.uid() = user_id);

create policy "user_wheel_items_owner_upsert" on public.user_wheel_items
  for insert with check (auth.uid() = user_id);

create policy "user_wheel_items_owner_update" on public.user_wheel_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_wheel_items_owner_delete" on public.user_wheel_items
  for delete using (auth.uid() = user_id);
