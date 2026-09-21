-- Public travel discussions; account privileges remain separate from content ownership.
begin;

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 2 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  place_name text not null check (char_length(btrim(place_name)) between 2 and 200),
  address text not null check (char_length(btrim(address)) between 2 and 500),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4 and array_position(photo_paths, null) is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 2 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_posts_feed on public.community_posts(created_at desc, id desc);
create index community_posts_owner on public.community_posts(user_id, created_at desc, id desc);
create index community_comments_thread on public.community_comments(post_id, created_at desc, id desc);
create index community_comments_owner on public.community_comments(user_id, created_at desc);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
revoke all on public.community_posts, public.community_comments from anon, authenticated;
grant select on public.community_posts, public.community_comments to anon, authenticated;
grant insert, delete on public.community_posts, public.community_comments to authenticated;
grant update(author_name, body, place_name, address, lat, lng) on public.community_posts to authenticated;
grant update(author_name, body) on public.community_comments to authenticated;

create policy community_posts_read on public.community_posts for select using (true);
create policy community_posts_insert on public.community_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy community_posts_update on public.community_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy community_posts_delete on public.community_posts for delete to authenticated using ((select auth.uid()) = user_id);
create policy community_comments_read on public.community_comments for select using (true);
create policy community_comments_insert on public.community_comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy community_comments_update on public.community_comments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy community_comments_delete on public.community_comments for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('community-photos', 'community-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);
create policy community_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'community-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
);
create policy community_photos_owner_read on storage.objects for select to authenticated using (
  bucket_id = 'community-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy community_photos_owner_delete on storage.objects for delete to authenticated using (
  bucket_id = 'community-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists(select 1 from public.community_posts p where name = any(p.photo_paths))
);

create function public.validate_community_content() returns trigger
language plpgsql set search_path = '' as $$
declare photo text; recent_count integer;
begin
  new.author_name := btrim(new.author_name);
  new.body := btrim(new.body);
  if tg_op = 'INSERT' then
    -- Serialise per-author inserts so concurrent requests cannot bypass the limit.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || tg_table_name, 0));
    if tg_table_name = 'community_posts' then
      select count(*) into recent_count from public.community_posts where user_id = new.user_id and created_at > now() - interval '1 minute';
    else
      select count(*) into recent_count from public.community_comments where user_id = new.user_id and created_at > now() - interval '1 minute';
    end if;
    if recent_count >= case when tg_table_name = 'community_posts' then 5 else 20 end then
      raise exception 'community-rate-limit' using errcode = 'P0001';
    end if;
    new.created_at := now();
  end if;
  new.updated_at := now();
  if tg_table_name = 'community_posts' then
    new.place_name := btrim(new.place_name);
    new.address := btrim(new.address);
    if tg_op = 'INSERT' then
      foreach photo in array new.photo_paths loop
        if photo is null or photo !~ ('^' || new.user_id::text || '/' || new.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
          or not exists(select 1 from storage.objects where bucket_id = 'community-photos' and name = photo) then
          raise exception 'invalid-community-photo' using errcode = '23514';
        end if;
      end loop;
    end if;
  end if;
  return new;
end $$;
create trigger validate_community_post before insert or update on public.community_posts for each row execute function public.validate_community_content();
create trigger validate_community_comment before insert or update on public.community_comments for each row execute function public.validate_community_content();
revoke all on function public.validate_community_content() from public;

-- Comments use one on-demand subscription per open discussion, never per feed card.
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.community_comments;
  end if;
end $$;
commit;
