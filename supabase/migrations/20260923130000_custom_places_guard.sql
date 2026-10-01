-- custom_places is a shared cache of places found by live search outside the
-- curated cities, so saved and shared itineraries can show them after a
-- reload. The planner works signed out, so any visitor may add a place — but
-- the table also let any visitor rewrite any place already there (an update
-- policy of "true"), which would change what every itinerary using it shows.
--
-- Now a place is written once and never rewritten from a browser; the client
-- inserts with "on conflict do nothing". What is written is checked first.
-- Admins can still delete a bad row (see 20260923120000_admin.sql).

begin;

drop policy if exists custom_places_public_update on public.custom_places;
revoke update on public.custom_places from anon, authenticated;

create function public.validate_custom_place() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id is null or length(new.id) not between 1 and 200 or new.id !~ '^[A-Za-z0-9:_.-]+$' then
    raise check_violation using message = 'Invalid place id';
  end if;
  if jsonb_typeof(new.data) is distinct from 'object' or new.data->>'id' is distinct from new.id then
    raise check_violation using message = 'Place data must be an object with the same id';
  end if;
  if octet_length(new.data::text) > 20000 then
    raise check_violation using message = 'Place data too large';
  end if;
  -- Links in the data end up as href/src on the page.
  if new.data::text ~* '"\s*(javascript|data|vbscript):' then
    raise check_violation using message = 'Unsafe link in place data';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger custom_places_validate before insert on public.custom_places
  for each row execute function public.validate_custom_place();

commit;
