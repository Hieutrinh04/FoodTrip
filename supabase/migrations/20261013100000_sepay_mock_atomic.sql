begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
create schema if not exists private;
create table if not exists private.settings(key text primary key,value text not null);
revoke all on private.settings from public,anon,authenticated;

create sequence public.mock_sepay_ids start -1 increment -1 minvalue -9223372036854775807 maxvalue -1;
revoke all on sequence public.mock_sepay_ids from public,anon,authenticated;
create table public.mock_sepay_requests (
  user_id uuid not null references auth.users(id),
  request_key uuid not null,
  booking_id uuid not null references public.bookings(id),
  scenario text not null check(scenario in ('exact','underpaid','remaining','wrong-code','wrong-account')),
  transaction_id bigint not null unique default nextval('public.mock_sepay_ids'),
  primary key(user_id,request_key)
);
alter table public.mock_sepay_requests enable row level security;
revoke all on public.mock_sepay_requests from public,anon,authenticated;

create function public.sepay_mock_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.settings where key='payment_mode' and value='sepay-mock')
$$;
revoke all on function public.sepay_mock_enabled() from public;
grant execute on function public.sepay_mock_enabled() to anon,authenticated,service_role;

-- Both the real webhook and the simulator use this one atomic settlement path.
-- A failed statement rolls back the claimed transfer and can be safely retried.
create function public.apply_sepay_transfer(p_tx jsonb,p_expected_account text,p_mock boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_id bigint; v_amount bigint; v_code text; v_account text; v_provider text;
  b public.bookings; existing public.payment_transactions; v_outcome text; v_received bigint;
begin
  if p_mock is null then raise exception 'invalid-transaction'; end if;
  v_id:=(p_tx->>'id')::bigint;
  v_amount:=round((p_tx->>'transferAmount')::numeric)::bigint;
  if v_id is null or (not p_mock and v_id<=0) or (p_mock and v_id>=0) or v_amount is null
    or v_amount<0 or v_amount>100000000000 then raise exception 'invalid-transaction'; end if;
  v_provider:=case when p_mock then 'sepay-mock' else 'sepay' end;
  v_code:=substring(upper(coalesce(p_tx->>'code','')||' '||coalesce(p_tx->>'content','')||' '||coalesce(p_tx->>'description','')) from 'FT[A-Z0-9]{10}');
  v_account:=p_tx->>'accountNumber';
  perform pg_advisory_xact_lock(v_id);
  select * into existing from public.payment_transactions where id=v_id;
  if existing.id is not null then
    if existing.provider<>v_provider then raise exception 'transaction-id-conflict'; end if;
    return jsonb_build_object('success',true,'duplicate',true,'outcome',existing.outcome,'transactionId',v_id);
  end if;

  if p_tx->>'transferType' is distinct from 'in' then v_outcome:='outgoing';
  elsif p_expected_account is null or v_account is distinct from p_expected_account then v_outcome:='wrong-account';
  elsif v_code is null then v_outcome:='no-booking';
  else
    select * into b from public.bookings where payment_code=v_code for update;
    if b.id is null then v_outcome:='no-booking';
    elsif b.payment_status<>'pending' then v_outcome:='not-pending';
    elsif not p_mock and exists(select 1 from public.payment_transactions where booking_id=b.id and provider='sepay-mock')
      then v_outcome:='mock-booking';
    else
      select coalesce(sum(amount),0)+v_amount into v_received from public.payment_transactions
        where booking_id=b.id and provider=v_provider and outcome='underpaid';
      v_outcome:=case when v_received<b.total_price then 'underpaid' else 'paid' end;
      if v_outcome='paid' then
        update public.bookings set payment_status='paid',payment_provider='sepay',
          payment_txn_ref=case when p_mock then 'DEMO' else 'SEPAY-'||v_id end,
          paid_at=coalesce(nullif(p_tx->>'transactionDate','')::timestamptz,now()) where id=b.id;
        -- These receipts have now been credited. They must not be manually
        -- reused to pay a second booking from the reconciliation screen.
        update public.payment_transactions set outcome='paid-partial'
          where booking_id=b.id and provider=v_provider and outcome='underpaid';
      end if;
    end if;
  end if;
  insert into public.payment_transactions(id,provider,booking_id,payment_code,amount,content,reference_code,
    account_number,gateway,transaction_date,raw,outcome)
    values(v_id,v_provider,b.id,v_code,v_amount,left(p_tx->>'content',2000),left(p_tx->>'referenceCode',200),
      v_account,left(p_tx->>'gateway',100),coalesce(nullif(p_tx->>'transactionDate','')::timestamptz,now()),p_tx,v_outcome);
  return jsonb_build_object('success',true,'outcome',v_outcome,'transactionId',v_id,'mock',p_mock);
end $$;
revoke all on function public.apply_sepay_transfer(jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.apply_sepay_transfer(jsonb,text,boolean) to service_role;

create function public.mock_sepay_transfer(p_booking uuid,p_key uuid,p_scenario text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.bookings; r public.mock_sepay_requests; v_amount bigint; v_account text:='MOCK-ACCOUNT'; v_code text;
begin
  if auth.uid() is null then raise exception 'login-required' using errcode='42501'; end if;
  if not public.sepay_mock_enabled() then raise exception 'mock-disabled' using errcode='42501'; end if;
  if p_key is null or p_scenario is null or p_scenario not in ('exact','underpaid','remaining','wrong-code','wrong-account') then raise exception 'invalid-scenario'; end if;
  select * into b from public.bookings where id=p_booking and user_id=auth.uid() for update;
  if b.id is null then raise exception 'not-your-booking' using errcode='42501'; end if;
  select * into r from public.mock_sepay_requests where user_id=auth.uid() and request_key=p_key;
  if r.transaction_id is not null then
    if r.booking_id<>p_booking or r.scenario<>p_scenario then raise exception 'request-key-conflict'; end if;
    return jsonb_build_object('success',true,'duplicate',true,'transactionId',r.transaction_id,
      'outcome',(select outcome from public.payment_transactions where id=r.transaction_id),'mock',true);
  end if;
  if b.payment_status<>'pending' then raise exception 'not-pending'; end if;
  if exists(select 1 from public.payment_transactions where booking_id=b.id and provider<>'sepay-mock')
    then raise exception 'real-transfer-exists'; end if;
  insert into public.mock_sepay_requests(user_id,request_key,booking_id,scenario)
    values(auth.uid(),p_key,b.id,p_scenario) returning * into r;
  v_amount:=b.total_price;
  v_code:=b.payment_code;
  if p_scenario='underpaid' then v_amount:=greatest(0,b.total_price-1000); end if;
  if p_scenario='remaining' then
    select greatest(0,b.total_price-coalesce(sum(amount),0)) into v_amount from public.payment_transactions
      where booking_id=b.id and provider='sepay-mock' and outcome='underpaid';
  end if;
  if p_scenario='wrong-code' then v_code:='WRONG-CODE'; end if;
  if p_scenario='wrong-account' then v_account:='WRONG-ACCOUNT'; end if;
  return public.apply_sepay_transfer(jsonb_build_object('id',r.transaction_id,'transferAmount',v_amount,
    'transferType','in','content',v_code,'accountNumber',v_account,'gateway','MOCK','referenceCode','MOCK-'||p_key),
    'MOCK-ACCOUNT',true);
end $$;
revoke all on function public.mock_sepay_transfer(uuid,uuid,text) from public,anon;
grant execute on function public.mock_sepay_transfer(uuid,uuid,text) to authenticated;

-- Mock transfers can never be manually matched as real bank receipts.
create or replace function public.admin_match_payment(p_transaction_id bigint,p_payment_code text) returns text
language plpgsql security definer set search_path='' as $$
declare tx public.payment_transactions; b public.bookings;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(p_transaction_id);
  select * into tx from public.payment_transactions where id=p_transaction_id;
  if tx.id is null then raise exception 'transaction-not-found'; end if;
  if tx.provider<>'sepay' then raise exception 'mock-transfer-not-matchable'; end if;
  -- Match the webhook's booking-before-receipt locking order. Lock both the
  -- original and target order before re-reading the outcome after any wait.
  perform id from public.bookings where id=tx.booking_id or payment_code=upper(btrim(p_payment_code)) order by id for update;
  select * into tx from public.payment_transactions where id=p_transaction_id for update;
  if tx.outcome not in ('no-booking','underpaid') then raise exception 'transaction-already-handled'; end if;
  select * into b from public.bookings where payment_code=upper(btrim(p_payment_code)) for update;
  if b.id is null then raise exception 'booking-not-found'; end if;
  if b.payment_status<>'pending' then raise exception 'booking-not-pending'; end if;
  if exists(select 1 from public.payment_transactions where booking_id=b.id and provider='sepay-mock')
    then raise exception 'mock-booking-not-matchable'; end if;
  if tx.amount<b.total_price then raise exception 'amount-too-small'; end if;
  update public.bookings set payment_status='paid',payment_provider='sepay',payment_txn_ref='SEPAY-'||tx.id,
    paid_at=coalesce(tx.transaction_date,now()) where id=b.id;
  update public.payment_transactions set outcome='paid',booking_id=b.id where id=tx.id;
  perform public.admin_log('payment.matched','payment_transactions',tx.id::text,jsonb_build_object('booking_id',b.id));
  return 'paid';
end $$;
revoke all on function public.admin_match_payment(bigint,text) from public,anon;
grant execute on function public.admin_match_payment(bigint,text) to authenticated;
notify pgrst,'reload schema';
commit;
