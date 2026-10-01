-- Photos a partner property shows travellers. Public to read; written only by
-- the people who run that property: property-photos/<property id>/<random>.<ext>.
begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy property_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'property-photos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and public.manages_property(((storage.foldername(name))[1])::uuid)
);
create policy property_photos_manager_delete on storage.objects for delete to authenticated using (
  bucket_id = 'property-photos'
  and name ~ '^[0-9a-f-]{36}/'
  and public.manages_property(((storage.foldername(name))[1])::uuid)
);
commit;
