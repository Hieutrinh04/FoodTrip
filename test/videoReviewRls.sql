-- Run against the linked database with `supabase db query --linked --file ...`.
-- All accounts and posts are isolated in one rolled-back transaction.
begin;
insert into auth.users(id) values ('f105f00d-0000-4000-8000-000000000001'), ('f105f00d-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f105f00d-0000-4000-8000-000000000001', true);

insert into public.video_reviews(id, video_url, platform, place_name, address, note)
values ('f105f00d-0000-4000-8000-000000000010', 'https://youtu.be/AbCdEf123_-?si=tracking', 'youtube', ' FoodTrip transaction test ', 'Hue', 'test');
do $$ begin
  if not exists(select 1 from public.video_reviews where id = 'f105f00d-0000-4000-8000-000000000010' and video_url = 'https://www.youtube.com/watch?v=AbCdEf123_-' and place_name = 'FoodTrip transaction test') then
    raise exception 'FAIL: create and URL canonicalization';
  end if;
  begin
    insert into public.video_reviews(video_url, platform, place_name, address) values
      ('https://youtube.com/shorts/AbCdEf123_-', 'youtube', 'FoodTrip transaction test', 'Hue');
    raise exception 'FAIL: duplicate allowed';
  exception when unique_violation then null; end;
  begin
    insert into public.video_reviews(user_id, video_url, platform, place_name) values
      ('f105f00d-0000-4000-8000-000000000002', 'https://youtu.be/AbCdEf123_-', 'youtube', 'Spoof owner');
    raise exception 'FAIL: owner spoof allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.video_reviews(video_url, platform, place_name) values
      ('https://evil-youtube.com/watch?v=AbCdEf123_-', 'youtube', 'Bad host');
    raise exception 'FAIL: hostile URL allowed';
  exception when check_violation then null; end;
  begin
    insert into public.video_reviews(video_url, platform, place_name, lat, lng) values
      ('https://youtu.be/AbCdEf123_-', 'youtube', 'Bad coords', 999, 106);
    raise exception 'FAIL: invalid coordinates allowed';
  exception when check_violation then null; end;
  -- A batch containing a duplicate must not publish the other row either.
  begin
    insert into public.video_reviews(video_url, platform, place_name, address) values
      ('https://youtu.be/AbCdEf123_-', 'youtube', 'Atomic companion', 'Hue'),
      ('https://youtu.be/AbCdEf123_-', 'youtube', 'FoodTrip transaction test', 'Hue');
    raise exception 'FAIL: duplicate batch allowed';
  exception when unique_violation then null; end;
  if exists(select 1 from public.video_reviews where place_name = 'Atomic companion') then raise exception 'FAIL: partial batch'; end if;
end $$;

update public.video_reviews set note = 'owner edited' where id = 'f105f00d-0000-4000-8000-000000000010';
select set_config('request.jwt.claim.sub', 'f105f00d-0000-4000-8000-000000000002', true);
do $$ declare affected integer; begin
  update public.video_reviews set note = 'intruder' where id = 'f105f00d-0000-4000-8000-000000000010';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: other user update allowed'; end if;
  delete from public.video_reviews where id = 'f105f00d-0000-4000-8000-000000000010';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: other user delete allowed'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ declare affected integer; begin
  if not exists(select 1 from public.video_reviews where id = 'f105f00d-0000-4000-8000-000000000010' and note = 'owner edited') then raise exception 'FAIL: public read'; end if;
  begin
    insert into public.video_reviews(video_url, platform, place_name) values ('https://youtu.be/AbCdEf123_-', 'youtube', 'Anonymous test');
    raise exception 'FAIL: anonymous insert allowed';
  exception when insufficient_privilege then null; end;
  delete from public.video_reviews where id = 'f105f00d-0000-4000-8000-000000000010';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: anonymous delete allowed'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f105f00d-0000-4000-8000-000000000001', true);
do $$ declare affected integer; begin
  delete from public.video_reviews where id = 'f105f00d-0000-4000-8000-000000000010';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner delete'; end if;
end $$;
rollback;
select 'PASS: ownership, public read, CRUD, duplicate and atomic batch, URL and coordinate validation; all fixtures rolled back' as result;
