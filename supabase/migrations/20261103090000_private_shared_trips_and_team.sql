-- A share link opens one trip; it must not let anyone list every shared trip or
-- learn who owns it. The select policy allowed both, so reading goes through a
-- function that needs the trip's id and leaves the owner out.
-- Deploy the frontend first: older pages read the table directly.
create function public.shared_itinerary(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(i) - 'user_id' from public.itineraries i where i.id = p_id and i.is_public
$$;
revoke all on function public.shared_itinerary(uuid) from public;
grant execute on function public.shared_itinerary(uuid) to anon, authenticated;

drop policy if exists "itineraries_public_select" on public.itineraries;

-- Team emails are for the owner, matching the portal, which hides Team from staff.
create or replace function public.property_team(p_property uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role) order by m.role desc, u.email), '[]'::jsonb)
  from public.property_managers m join auth.users u on u.id = m.user_id
  where m.property_id = p_property and (public.is_admin() or exists (
    select 1 from public.property_managers o where o.property_id = p_property and o.user_id = auth.uid() and o.role = 'owner'))
$$;
