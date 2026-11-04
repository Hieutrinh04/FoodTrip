-- What FoodTrip's own users say about a place, apart from Google's figures and
-- the sample dataset's illustrative reviews:
--   * how many people saved it (a count; never who), and
--   * their reviews: 1–5 stars and an optional comment, one per person and
--     place, editable and removable by its author, hidden by an administrator.
-- A place review is not tied to a booking, so the page says it is unverified.
-- Authors show as "Mai T." (private.review_author, as for stay and tour reviews).
begin;

create table public.place_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id text not null check (char_length(place_id) between 3 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  author_name text not null default '' check (char_length(author_name) <= 60),
  hidden boolean not null default false,
  hidden_note text check (hidden_note is null or char_length(hidden_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);
create index place_reviews_place_idx on public.place_reviews (place_id, created_at desc);
alter table public.place_reviews enable row level security;
revoke all on public.place_reviews from anon, authenticated;

-- Everything public about one place: saves, the rating of visible reviews and
-- the newest of them; for a signed-in caller, also their own review.
create function public.place_public_facts(p_place text, p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'saved', (select count(*) from public.saved_places s where s.place_id = p_place),
    'rating', (select round(avg(r.rating)::numeric, 1) from public.place_reviews r where r.place_id = p_place and not r.hidden),
    'review_count', (select count(*) from public.place_reviews r where r.place_id = p_place and not r.hidden),
    'items', coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
      select r.id, r.rating, r.comment, r.author_name as author, r.created_at, r.updated_at
      from public.place_reviews r where r.place_id = p_place and not r.hidden
      order by r.created_at desc limit least(greatest(coalesce(p_limit, 10), 1), 50)) q), '[]'::jsonb),
    'mine', (select jsonb_build_object('rating', r.rating, 'comment', r.comment, 'hidden', r.hidden, 'hidden_note', r.hidden_note)
      from public.place_reviews r where r.place_id = p_place and r.user_id = (select auth.uid()))
  )
  where char_length(coalesce(p_place, '')) between 3 and 200
$$;
revoke all on function public.place_public_facts(text, integer) from public;
grant execute on function public.place_public_facts(text, integer) to anon, authenticated;

-- Writes (or rewrites) the caller's review of a place.
create function public.submit_place_review(p_place text, p_rating integer, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_name text;
begin
  if v_uid is null then raise exception 'sign-in-required' using errcode = '42501'; end if;
  if char_length(coalesce(p_place, '')) not between 3 and 200 then raise exception 'invalid-place' using errcode = '22023'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid-rating' using errcode = '22023'; end if;
  if char_length(coalesce(p_comment, '')) > 1000 then raise exception 'comment-too-long' using errcode = '22023'; end if;
  select private.review_author(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')) into v_name
    from auth.users u where u.id = v_uid;
  insert into public.place_reviews (place_id, user_id, rating, comment, author_name)
    values (p_place, v_uid, p_rating, nullif(btrim(coalesce(p_comment, '')), ''), coalesce(v_name, ''))
  on conflict (place_id, user_id) do update
    set rating = excluded.rating, comment = excluded.comment, author_name = excluded.author_name, updated_at = now();
end $$;
revoke all on function public.submit_place_review(text, integer, text) from public, anon;
grant execute on function public.submit_place_review(text, integer, text) to authenticated;

create function public.delete_my_place_review(p_place text) returns void
language sql security definer set search_path = '' as $$
  delete from public.place_reviews where place_id = p_place and user_id = (select auth.uid())
$$;
revoke all on function public.delete_my_place_review(text) from public, anon;
grant execute on function public.delete_my_place_review(text) to authenticated;

-- Administrators: the newest place reviews, and hiding one.
create function public.admin_list_place_reviews() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'admins-only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select r.id, r.place_id, r.rating, r.comment, r.author_name as author, r.hidden, r.hidden_note, r.created_at
    from public.place_reviews r order by r.created_at desc limit 200) q), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_place_reviews() from public, anon;
grant execute on function public.admin_list_place_reviews() to authenticated;

create function public.admin_set_place_review_hidden(p_review uuid, p_hidden boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'admins-only' using errcode = '42501'; end if;
  update public.place_reviews set hidden = coalesce(p_hidden, false), hidden_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), updated_at = now()
    where id = p_review;
end $$;
revoke all on function public.admin_set_place_review_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_place_review_hidden(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
commit;
