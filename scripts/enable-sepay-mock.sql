-- Explicit opt-in for a named test project only. Never run as part of migrations.
-- Invoke: supabase db query --linked --file scripts/enable-sepay-mock.sql
begin;
do $$ begin
  if exists(select 1 from public.bookings where payment_status='paid' and coalesce(payment_txn_ref,'')<>'DEMO')
    then raise exception 'real-paid-bookings-exist'; end if;
end $$;
insert into private.settings(key,value) values('payment_mode','sepay-mock')
  on conflict(key) do update set value=excluded.value;
select public.sepay_mock_enabled() as mock_enabled;
commit;
