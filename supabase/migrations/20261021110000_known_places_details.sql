-- Known venues become FoodTrip's own venue data, not only a list of names.
--
-- Every venue a search finds — when someone shares a video, types a venue name,
-- or opens a venue's details anywhere on the site — is stored with what Google
-- says about it (category, rating, review count, opening hours, phone, website,
-- photo, Maps link). place-details answers from here first, so a venue looked
-- up once is not paid for again for 30 days, whichever page asks.
--
-- source: 'seed' (initial list), 'search' (found by a search, nobody confirmed
-- it yet), 'confirmed' (someone shared a video of it). A search never
-- downgrades a confirmed venue, and confirmations only come from
-- remember_share_place(). Still service-role only: no API role reads or writes
-- the table directly.

begin;

alter table public.known_places drop constraint known_places_source_check;
alter table public.known_places add constraint known_places_source_check check (source in ('seed', 'search', 'confirmed'));
alter table public.known_places alter column source set default 'search';

alter table public.known_places
  add column category text check (category is null or char_length(category) <= 120),
  add column rating numeric(2,1) check (rating is null or rating between 0 and 5),
  add column rating_count integer check (rating_count is null or rating_count >= 0),
  add column phone text check (phone is null or char_length(phone) <= 40),
  add column website text check (website is null or char_length(website) <= 500),
  add column price_level text check (price_level is null or char_length(price_level) <= 60),
  add column hours jsonb check (hours is null or jsonb_typeof(hours) = 'array'),
  add column thumbnail_url text check (thumbnail_url is null or char_length(thumbnail_url) <= 1000),
  add column maps_url text check (maps_url is null or char_length(maps_url) <= 300),
  add column details_at timestamptz,
  add column created_at timestamptz not null default now();

-- place-details looks venues up by position (a box of about ±450 m).
create index known_places_position_idx on public.known_places (lat, lng) where lat is not null;

notify pgrst, 'reload schema';
commit;
