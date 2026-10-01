-- Supabase can grant EXECUTE directly to anon/authenticated through default
-- privileges. Revoking PUBLIC alone does not remove those explicit grants.
-- Only the catalogue and room quote are anonymous endpoints.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

revoke all on function public.inventory_owner(uuid) from anon;
revoke all on function public.manager_save_room(uuid,text,int,int,bigint) from anon;
revoke all on function public.manager_set_room_dates(uuid,date,date,int,bigint) from anon;
revoke all on function public.manager_enable_inventory(uuid) from anon;
revoke all on function public.reserve_partner_room(uuid,date,date,int,text,text,text,bigint,uuid) from anon;
revoke all on function public.room_reserved(uuid,date,uuid) from anon,authenticated;
revoke all on function public.guard_inventory_booking() from anon,authenticated;

revoke all on function public.tour_can_manage(uuid) from anon;
revoke all on function public.tour_apply(text,text) from anon;
revoke all on function public.tour_review_operator(uuid,boolean,text) from anon;
revoke all on function public.tour_add_member(uuid,text,text) from anon;
revoke all on function public.tour_remove_member(uuid,uuid) from anon;
revoke all on function public.tour_create(uuid,text,text,text,text) from anon;
revoke all on function public.tour_publish(uuid,boolean) from anon;
revoke all on function public.tour_create_departure(uuid,timestamptz,timestamptz,int,bigint,uuid) from anon;
revoke all on function public.tour_update_departure(uuid,boolean,uuid) from anon;
revoke all on function public.tour_reserve(uuid,int,text,text,uuid,bigint) from anon;
revoke all on function public.tour_set_reservation(uuid,text,text) from anon;
revoke all on function public.tour_guide_manifest() from anon;
revoke all on function public.tour_my_reservations() from anon;

notify pgrst, 'reload schema';
commit;
