-- Integration fixtures never escape this rolled-back transaction.
begin;
insert into auth.users(id) values ('f105f00d-0021-4000-8000-000000000001'), ('f105f00d-0021-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f105f00d-0021-4000-8000-000000000001', true);
insert into storage.objects(bucket_id, name, owner_id) values ('community-photos', 'f105f00d-0021-4000-8000-000000000001/f105f00d-0021-4000-8000-000000000010/f105f00d-0021-4000-8000-000000000099.jpg', 'f105f00d-0021-4000-8000-000000000001');
insert into public.community_posts(id, author_name, body, place_name, address, lat, lng, photo_paths, created_at)
values ('f105f00d-0021-4000-8000-000000000010', ' Test author ', ' Test post ', 'Test place', 'Test area', 10.7, 106.7,
array['f105f00d-0021-4000-8000-000000000001/f105f00d-0021-4000-8000-000000000010/f105f00d-0021-4000-8000-000000000099.jpg'], '2000-01-01');
do $$ begin
  if not exists(select 1 from public.community_posts where id = 'f105f00d-0021-4000-8000-000000000010' and author_name = 'Test author' and created_at = now()) then raise exception 'FAIL: normalization / trusted timestamp'; end if;
  begin
    update public.community_posts set user_id = 'f105f00d-0021-4000-8000-000000000002' where id = 'f105f00d-0021-4000-8000-000000000010';
    raise exception 'FAIL: owner reassignment';
  exception when insufficient_privilege then null; end;
  begin
    update public.community_posts set created_at = '2000-01-01' where id = 'f105f00d-0021-4000-8000-000000000010';
    raise exception 'FAIL: timestamp reassignment';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.community_posts(author_name, body, place_name, address, lat, lng) values ('Test', 'test', 'place', 'area', 999, 106);
    raise exception 'FAIL: coordinates accepted';
  exception when check_violation then null; end;
  begin
    insert into public.community_posts(author_name, body, place_name, address, lat, lng, photo_paths) values ('Test', 'test', 'place', 'area', 10, 106, array['https://evil.test/image.jpg']);
    raise exception 'FAIL: external image path accepted';
  exception when check_violation then null; end;
  begin
    insert into public.community_posts(id, author_name, body, place_name, address, lat, lng, photo_paths)
      values ('f105f00d-0021-4000-8000-000000000011', 'Test', 'test', 'place', 'area', 10, 106,
        array['f105f00d-0021-4000-8000-000000000001/f105f00d-0021-4000-8000-000000000011/f105f00d-0021-4000-8000-000000000098.jpg']);
    raise exception 'FAIL: nonexistent uploaded image accepted';
  exception when check_violation then null; end;
  begin
    insert into public.community_posts(author_name, body, place_name, address, lat, lng) values ('Test', repeat('a', 3001), 'place', 'area', 10, 106);
    raise exception 'FAIL: oversized body accepted';
  exception when check_violation then null; end;
  begin
    insert into public.community_posts(user_id, author_name, body, place_name, address, lat, lng) values ('f105f00d-0021-4000-8000-000000000002', 'Test', 'test', 'place', 'area', 10, 106);
    raise exception 'FAIL: spoofed author accepted';
  exception when insufficient_privilege then null; end;
end $$;
update public.community_posts set body = 'Owner edited' where id = 'f105f00d-0021-4000-8000-000000000010';

select set_config('request.jwt.claim.sub', 'f105f00d-0021-4000-8000-000000000002', true);
insert into public.community_comments(id, post_id, author_name, body) values ('f105f00d-0021-4000-8000-000000000020', 'f105f00d-0021-4000-8000-000000000010', 'Other member', 'A discussion');
update public.community_comments set body = 'Comment edited' where id = 'f105f00d-0021-4000-8000-000000000020';
insert into public.community_comments(id, post_id, author_name, body) values ('f105f00d-0021-4000-8000-000000000021', 'f105f00d-0021-4000-8000-000000000010', 'Other member', 'Owner deletes this');
delete from public.community_comments where id = 'f105f00d-0021-4000-8000-000000000021';
do $$ declare affected integer; begin
  if exists(select 1 from public.community_comments where id = 'f105f00d-0021-4000-8000-000000000021') then raise exception 'FAIL: own comment deletion'; end if;
  update public.community_posts set body = 'Intruder' where id = 'f105f00d-0021-4000-8000-000000000010';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another member edited post'; end if;
  delete from public.community_posts where id = 'f105f00d-0021-4000-8000-000000000010';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another member deleted post'; end if;
  begin
    insert into storage.objects(bucket_id, name) values ('community-photos', 'f105f00d-0021-4000-8000-000000000001/f105f00d-0021-4000-8000-000000000010/f105f00d-0021-4000-8000-000000000098.jpg');
    raise exception 'FAIL: another member uploaded to owner folder';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', 'f105f00d-0021-4000-8000-000000000001', true);
do $$ declare affected integer; begin
  update public.community_comments set body = 'Post author cannot edit another member comment' where id = 'f105f00d-0021-4000-8000-000000000020';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: post author edited another member comment'; end if;
  delete from public.community_comments where id = 'f105f00d-0021-4000-8000-000000000020';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: post author deleted another member comment'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if not exists(select 1 from public.community_posts where id = 'f105f00d-0021-4000-8000-000000000010' and body = 'Owner edited') then raise exception 'FAIL: guest read post'; end if;
  if not exists(select 1 from public.community_comments where id = 'f105f00d-0021-4000-8000-000000000020' and body = 'Comment edited') then raise exception 'FAIL: guest read comments'; end if;
  begin
    insert into public.community_comments(post_id, author_name, body) values ('f105f00d-0021-4000-8000-000000000010', 'Guest', 'No permission');
    raise exception 'FAIL: guest comment accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.community_posts where id = 'f105f00d-0021-4000-8000-000000000010';
    raise exception 'FAIL: guest delete accepted';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f105f00d-0021-4000-8000-000000000001', true);
delete from public.community_posts where id = 'f105f00d-0021-4000-8000-000000000010';
do $$ begin
  if exists(select 1 from public.community_comments where post_id = 'f105f00d-0021-4000-8000-000000000010') then raise exception 'FAIL: comment cascade'; end if;
  for i in 1..5 loop
    insert into public.community_posts(author_name, body, place_name, address, lat, lng) values ('Test', 'Rate limit test', 'place', 'area', 10, 106);
  end loop;
  begin
    insert into public.community_posts(author_name, body, place_name, address, lat, lng) values ('Test', 'Rate limit overflow', 'place', 'area', 10, 106);
    raise exception 'FAIL: post rate limit not enforced' using errcode = '23514';
  exception when raise_exception then
    if sqlerrm <> 'community-rate-limit' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: post/comment ownership, public reads, author spoofing, coordinate validation, photo path ownership, immutable fields, cascading comments; fixtures rolled back' as result;
