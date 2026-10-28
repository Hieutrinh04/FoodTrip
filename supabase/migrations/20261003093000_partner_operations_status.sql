-- A suspended property still sees its portal, with the reason it was
-- suspended (not the sign-up form again); the admin's property list shows
-- whether each property is live, self-listed and ready to be paid.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.properties add column suspension_note text check (suspension_note is null or char_length(suspension_note) <= 2000);

create or replace function public.admin_set_property_active(p_property uuid, p_active boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  if not p_active and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note-required' using errcode = '22023'; end if;
  update public.properties set active = p_active, suspension_note = case when p_active then null else btrim(p_note) end where id = p_property;
  if not found then raise exception 'property-not-found' using errcode = 'P0002'; end if;
  perform public.admin_log(case when p_active then 'property.restored' else 'property.suspended' end, 'properties', p_property::text, jsonb_build_object('note', btrim(coalesce(p_note, ''))));
end $$;

drop function public.admin_list_properties();
create function public.admin_list_properties()
returns table (id uuid, hotel_place_id text, name text, address text, phone text, active boolean, created_at timestamptz,
  managers jsonb, bookings bigint, awaiting bigint, inventory_enabled boolean, self_listed boolean, property_type text, city text,
  suspension_note text, has_payout boolean, readiness jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return query
    select p.id, p.hotel_place_id, p.name, p.address, p.phone, p.active, p.created_at,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email, 'role', pm.role) order by pm.role, u.email)
        from public.property_managers pm join auth.users u on u.id = pm.user_id where pm.property_id = p.id), '[]'::jsonb),
      (select count(*) from public.bookings b where b.hotel_place_id = p.hotel_place_id),
      (select count(*) from public.bookings b where b.hotel_place_id = p.hotel_place_id and b.payment_status = 'paid' and b.fulfillment_status = 'awaiting'),
      p.inventory_enabled, p.self_listed, p.property_type, p.city, p.suspension_note,
      exists (select 1 from public.property_payouts x where x.property_id = p.id),
      public.property_readiness_internal(p.id)
    from public.properties p
    order by p.created_at desc;
end;
$$;
revoke all on function public.admin_list_properties() from public, anon;
grant execute on function public.admin_list_properties() to authenticated;

notify pgrst, 'reload schema';
commit;
