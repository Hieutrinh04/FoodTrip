-- Photos for tour pages. Public to read (they are on a public page); written
-- only by the owners and managers of the operator whose folder they go in:
-- tour-photos/<operator id>/<random id>.<jpg|png|webp>.
begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('tour-photos', 'tour-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy tour_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'tour-photos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and public.tour_can_manage(((storage.foldername(name))[1])::uuid)
);
create policy tour_photos_manager_delete on storage.objects for delete to authenticated using (
  bucket_id = 'tour-photos'
  and name ~ '^[0-9a-f-]{36}/'
  and public.tour_can_manage(((storage.foldername(name))[1])::uuid)
);
commit;
