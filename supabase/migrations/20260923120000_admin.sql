-- Site administration: who counts as an admin, and what admins may see and do.
--
-- Admin rights live in the database, not in the client. The /admin page only
-- decides what to draw; every read and write it makes goes through the RLS
-- policies below, which ask public.is_admin(). A user who opens the page
-- without a row in admin_users gets nothing back.
--
-- Admins are added by SQL only — there is deliberately no API for it, so no
-- client bug can turn a user into an admin:
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = '<email>';
--
-- What admins may do, and nothing more:
--   bookings              read all; cancel a pending one (the payment guard
--                         trigger still refuses every other change)
--   contact_messages      read, mark handled, delete
--   newsletter_subscribers read, delete
--   community posts/comments, video_reviews, custom_places   delete (moderation)
--   community-photos      delete the photos of a post being removed
--   admin_overview(), admin_list_users()   counts and the account list

begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Bookings: every booking is visible to admins; the owner-only policies stay.
create policy bookings_admin_select on public.bookings for select to authenticated
  using ((select public.is_admin()));
create policy bookings_admin_update on public.bookings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Contact form inbox.
alter table public.contact_messages add column if not exists handled_at timestamptz;
create policy contact_messages_admin_select on public.contact_messages for select to authenticated
  using ((select public.is_admin()));
create policy contact_messages_admin_update on public.contact_messages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy contact_messages_admin_delete on public.contact_messages for delete to authenticated
  using ((select public.is_admin()));
revoke update on public.contact_messages from anon, authenticated;
grant update (handled_at) on public.contact_messages to authenticated;

-- Newsletter list.
create policy newsletter_admin_select on public.newsletter_subscribers for select to authenticated
  using ((select public.is_admin()));
create policy newsletter_admin_delete on public.newsletter_subscribers for delete to authenticated
  using ((select public.is_admin()));

-- Moderation.
create policy community_posts_admin_delete on public.community_posts for delete to authenticated
  using ((select public.is_admin()));
create policy community_comments_admin_delete on public.community_comments for delete to authenticated
  using ((select public.is_admin()));
create policy video_reviews_admin_delete on public.video_reviews for delete to authenticated
  using ((select public.is_admin()));
create policy custom_places_admin_delete on public.custom_places for delete to authenticated
  using ((select public.is_admin()));
grant delete on public.custom_places to authenticated;
create policy community_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'community-photos' and (select public.is_admin()));

-- Counts for the overview. Security definer so it can count auth.users, which
-- no client can read; it refuses anyone who is not an admin.
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not-admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'bookings', coalesce((select jsonb_object_agg(payment_status, n) from (
      select payment_status, count(*) as n from public.bookings group by payment_status) s), '{}'::jsonb),
    'revenue_paid', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'paid'),
    'posts', (select count(*) from public.community_posts),
    'comments', (select count(*) from public.community_comments),
    'messages_open', (select count(*) from public.contact_messages where handled_at is null),
    'subscribers', (select count(*) from public.newsletter_subscribers),
    'video_reviews', (select count(*) from public.video_reviews),
    'itineraries', (select count(*) from public.itineraries),
    'saved_places', (select count(*) from public.saved_places),
    'signups_by_day', (select jsonb_agg(jsonb_build_object('day', d::date, 'n', (
        select count(*) from auth.users u where u.created_at >= d and u.created_at < d + interval '1 day')) order by d)
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as d)
  );
end;
$$;
revoke all on function public.admin_overview() from public;
grant execute on function public.admin_overview() to authenticated;

-- The account list, newest first, optionally filtered by email.
create function public.admin_list_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  bookings bigint, posts bigint, is_admin boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not-admin' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
      (select count(*) from public.bookings b where b.user_id = u.id),
      (select count(*) from public.community_posts p where p.user_id = u.id),
      exists (select 1 from public.admin_users a where a.user_id = u.id)
    from auth.users u
    where coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%'
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;
revoke all on function public.admin_list_users(text, int, int) from public;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

commit;
