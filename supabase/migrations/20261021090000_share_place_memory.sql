-- What detect-place knows without a map search, and what it learns from
-- people sharing videos.
--
-- known_places   venues it can recognise in a caption: seeded from real Google
--                Maps venues (next migration), grown by every venue a person
--                confirms when sharing a video. `core` is the name reduced the
--                way placeNames.js coreName() does (no accents, no leading
--                "quán / nhà hàng …"), so the Edge Function can compare quickly.
-- place_aliases  how captions referred to a venue a person then confirmed:
--                "chú 7 Tới" → Quán Bánh xèo 7 Tới. Next time those words
--                appear, the venue is suggested straight away.
--
-- Read by Edge Functions with the service role; written only through
-- remember_share_place(), called by the signed-in person who shared. No API
-- role reads or writes the tables directly.

begin;

create table public.known_places (
  place_id text primary key check (char_length(place_id) between 3 and 200),
  name text not null check (char_length(name) between 2 and 200),
  core text not null check (char_length(core) between 1 and 200),
  address text check (address is null or char_length(address) <= 500),
  city text check (city is null or char_length(city) <= 100),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  source text not null check (source in ('seed', 'confirmed')),
  confirmations integer not null default 0,
  updated_at timestamptz not null default now()
);
create index known_places_core_idx on public.known_places (core);
alter table public.known_places enable row level security;
revoke all on public.known_places from anon, authenticated;

create table public.place_aliases (
  alias text not null check (char_length(alias) between 3 and 120),
  place_id text not null references public.known_places(place_id) on delete cascade,
  hits integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (alias, place_id)
);
alter table public.place_aliases enable row level security;
revoke all on public.place_aliases from anon, authenticated;

-- The person who shares a video confirms which venue it shows; remember the
-- venue (with its coordinates) and the words the caption used for it.
-- p_place: { place_id, name, core, address, city, lat, lng }; p_aliases: cores (max 5).
create function public.remember_share_place(p_place jsonb, p_aliases text[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := btrim(coalesce(p_place->>'place_id', ''));
  v_name text := btrim(coalesce(p_place->>'name', ''));
  v_core text := btrim(coalesce(p_place->>'core', ''));
  v_lat double precision := nullif(p_place->>'lat', '')::double precision;
  v_lng double precision := nullif(p_place->>'lng', '')::double precision;
  v_alias text;
begin
  if auth.uid() is null then raise exception 'login-required' using errcode = '42501'; end if;
  if char_length(v_id) not between 3 and 200 or char_length(v_name) not between 2 and 200 or char_length(v_core) not between 1 and 200
     or v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'invalid-place' using errcode = '22023';
  end if;
  insert into public.known_places (place_id, name, core, address, city, lat, lng, source, confirmations)
  values (v_id, v_name, v_core, left(p_place->>'address', 500), left(p_place->>'city', 100), v_lat, v_lng, 'confirmed', 1)
  on conflict (place_id) do update set
    lat = excluded.lat, lng = excluded.lng, address = coalesce(excluded.address, known_places.address),
    city = coalesce(excluded.city, known_places.city), source = 'confirmed',
    confirmations = known_places.confirmations + 1, updated_at = now();
  foreach v_alias in array coalesce(p_aliases[1:5], '{}') loop
    v_alias := btrim(lower(v_alias));
    continue when char_length(v_alias) not between 3 and 120;
    insert into public.place_aliases (alias, place_id) values (v_alias, v_id)
    on conflict (alias, place_id) do update set hits = place_aliases.hits + 1, updated_at = now();
  end loop;
end $$;
revoke all on function public.remember_share_place(jsonb, text[]) from public, anon;
grant execute on function public.remember_share_place(jsonb, text[]) to authenticated;

notify pgrst, 'reload schema';
commit;
