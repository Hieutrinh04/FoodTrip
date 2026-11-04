-- How many places (eateries and sights) FoodTrip has kept in each city, for the city pages and the
-- home page's city grid. Counts only: the same rows place_catalog lists
-- (located, not a map-search placeholder, not a hotel), grouped by the city
-- text the app wrote when it saved them. No venue, alias or search memory is
-- exposed beyond what place_catalog already publishes.
begin;
create function public.place_city_counts()
returns table (city text, places bigint)
language sql stable security definer set search_path = '' as $$
  select k.city, count(*)
  from public.known_places k
  where k.lat is not null and k.lng is not null
    and k.place_id not like 'map:%'
    and coalesce(k.category, '') !~* 'hotel|lodging|khách sạn|homestay'
    and nullif(btrim(k.city), '') is not null
  group by k.city;
$$;
revoke all on function public.place_city_counts() from public;
grant execute on function public.place_city_counts() to anon, authenticated;
comment on function public.place_city_counts() is 'Public count of kept venues per city (same rows as place_catalog).';
notify pgrst, 'reload schema';
commit;
