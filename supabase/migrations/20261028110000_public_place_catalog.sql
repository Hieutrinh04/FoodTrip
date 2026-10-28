-- Public venue facts only; aliases, confirmations and internal search memory
-- remain inaccessible to API roles. No new browser write privileges.
begin;
create function public.place_catalog(p_after text default '', p_limit integer default 500)
returns table (
  place_id text, name text, address text, city text, lat double precision, lng double precision,
  category text, rating numeric, rating_count integer, hours jsonb,
  thumbnail_url text, maps_url text, phone text, website text, price_level text
)
language sql stable security definer set search_path = '' as $$
  select k.place_id, k.name, k.address, k.city, k.lat, k.lng,
    k.category, k.rating, k.rating_count, k.hours,
    k.thumbnail_url, k.maps_url, k.phone, k.website, k.price_level
  from public.known_places k
  where k.lat is not null and k.lng is not null
    and k.place_id > coalesce(p_after, '')
    and k.place_id not like 'map:%'
  order by k.place_id
  limit greatest(1, least(coalesce(p_limit, 500), 500));
$$;
revoke all on function public.place_catalog(text, integer) from public;
grant execute on function public.place_catalog(text, integer) to anon, authenticated;
comment on function public.place_catalog(text, integer) is 'Public listing facts for persistent Explore catalogue; keyset pagination by Google place id.';
notify pgrst, 'reload schema';
commit;
