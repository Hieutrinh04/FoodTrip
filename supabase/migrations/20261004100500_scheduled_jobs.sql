-- The schedule: pg_cron runs the jobs, pg_net lets the database call the
-- send-notifications function. The function's address and the shared secret
-- live in private.settings (never in this file); the email job does nothing
-- until both are set.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
revoke all on private.settings from public, anon, authenticated;

alter table public.notifications add column if not exists email_claimed_at timestamptz;

-- Hands the email sender a batch nobody else is sending, marking it claimed
-- (a claim older than 5 minutes is considered abandoned and retried).
create or replace function public.claim_notification_emails(p_limit int default 50)
returns table (id uuid, user_id uuid, title text, body text, link text, email_attempts int)
language sql security definer set search_path = '' as $$
  update public.notifications n set email_claimed_at = now(), email_attempts = n.email_attempts + 1
  where n.id in (
    select x.id from public.notifications x
    where x.email_status = 'pending' and (x.email_claimed_at is null or x.email_claimed_at < now() - interval '5 minutes')
    order by x.created_at limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked)
  returning n.id, n.user_id, n.title, n.body, n.link, n.email_attempts
$$;
revoke all on function public.claim_notification_emails(int) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(int) to service_role;

create or replace function private.dispatch_notification_emails() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.settings where key = 'functions_url';
  select value into v_secret from private.settings where key = 'cron_secret';
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.notifications where email_status = 'pending') then return; end if;
  perform net.http_post(url := v_url || '/send-notifications',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret), body := '{}'::jsonb);
end $$;

do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname like 'ft-%';
end $$;
select cron.schedule('ft-expire-unpaid-bookings', '*/5 * * * *', 'select public.expire_unpaid_bookings()');
select cron.schedule('ft-expire-tour-requests', '15 * * * *', 'select public.expire_tour_requests()');
select cron.schedule('ft-daily-reminders', '0 1 * * *', 'select public.send_daily_reminders()');  -- 08:00 in Vietnam
select cron.schedule('ft-send-emails', '* * * * *', 'select private.dispatch_notification_emails()');
