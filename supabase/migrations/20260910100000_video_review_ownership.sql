begin;

alter table public.video_reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists note text not null default '';
alter table public.video_reviews alter column user_id set default auth.uid();

-- Preserve existing community posts without assigning them to an arbitrary user.
drop policy if exists video_reviews_public_insert on public.video_reviews;
drop policy if exists video_reviews_public_delete on public.video_reviews;
create policy video_reviews_owner_insert on public.video_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy video_reviews_owner_update on public.video_reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy video_reviews_owner_delete on public.video_reviews for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.validate_video_review() returns trigger
language plpgsql set search_path = '' as $$
declare
  host text;
  video_id text;
begin
  new.place_name := btrim(new.place_name);
  new.address := btrim(coalesce(new.address, ''));
  new.note := btrim(coalesce(new.note, ''));
  if new.place_name is null or length(new.place_name) not between 1 and 200
    or length(new.address) > 500 or length(new.note) > 1000
    or length(new.video_url) > 2048 then
    raise check_violation using message = 'Invalid review details';
  end if;
  host := substring(new.video_url from '^https://([a-zA-Z0-9.-]+)/');
  if host is null or not (
    (new.platform = 'youtube' and host ~ '(^|\.)(youtube\.com|youtu\.be)$') or
    (new.platform = 'tiktok' and host ~ '(^|\.)tiktok\.com$') or
    (new.platform = 'facebook' and host ~ '(^|\.)(facebook\.com|fb\.watch)$') or
    (new.platform = 'instagram' and host ~ '(^|\.)instagram\.com$')
  ) then raise check_violation using message = 'Invalid video URL'; end if;
  if new.platform = 'youtube' then
    video_id := coalesce(substring(new.video_url from '[?&]v=([a-zA-Z0-9_-]{11})(?:[&#]|$)'),
      substring(new.video_url from '(?:youtu\.be/|/shorts/|/embed/|/live/)([a-zA-Z0-9_-]{11})(?:[/?#]|$)'));
    if video_id is null then raise check_violation using message = 'Invalid YouTube video'; end if;
    new.video_url := 'https://www.youtube.com/watch?v=' || video_id;
  elsif new.platform in ('tiktok', 'instagram') then
    new.video_url := regexp_replace(new.video_url, '[?#].*$', '');
  end if;
  if (new.lat is null) <> (new.lng is null) or
    (new.lat is not null and not (new.lat between -90 and 90 and new.lng between -180 and 180)) then
    raise check_violation using message = 'Invalid coordinates';
  end if;
  if new.lat is null then new.google_place_id := null; end if;
  -- HTML supplied by third-party providers is not needed by the safe URL player.
  new.embed_html := null;
  return new;
end;
$$;
create trigger video_reviews_validate before insert or update on public.video_reviews
  for each row execute function public.validate_video_review();

-- Concurrent submissions of the same user's video/place pair are rejected atomically.
create unique index video_reviews_owner_video_place_unique on public.video_reviews
  (user_id, md5(video_url), md5(coalesce(nullif(google_place_id, ''), lower(btrim(place_name)) || '|' || lower(btrim(coalesce(address, ''))))))
  where user_id is not null;
create index video_reviews_user_created_idx on public.video_reviews(user_id, created_at desc);
commit;
