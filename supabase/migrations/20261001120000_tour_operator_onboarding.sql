-- Tour operators join the way places to stay do (and the way Agoda and
-- Traveloka onboard experience partners): a short sign-up with contact,
-- papers and the partner terms; then a checklist before a tour can be
-- published — the operator's profile, and for each tour its photos,
-- introduction, programme, inclusions, cancellation policy and a departure.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- One terms table for both kinds of partner; versions stay unique overall.
alter table public.partner_terms add column kind text not null default 'stay' check (kind in ('stay', 'tour'));
insert into public.partner_terms (version, kind, commission_pct, payout_days, summary) values (2, 'tour', 10, 0,
'FoodTrip chuyển yêu cầu giữ chỗ của du khách đến đơn vị tổ chức tour. Trong giai đoạn này FoodTrip chưa thu tiền tour: đơn vị xác nhận hoặc từ chối yêu cầu trong 24 giờ, tự hướng dẫn khách thanh toán và chịu trách nhiệm thực hiện tour đúng lịch trình, giá và dịch vụ đã đăng. Hoa hồng 10% tính trên giá trị mỗi đơn hoàn thành; FoodTrip gửi bảng đối soát vào ngày 5 hằng tháng, đơn vị thanh toán trong 7 ngày. Đơn vị cam kết có giấy phép kinh doanh lữ hành hoặc giấy tờ phù hợp với loại hình tour theo quy định, hướng dẫn viên có thẻ khi pháp luật yêu cầu, và thông báo ngay khi huỷ chuyến để FoodTrip báo cho khách. Mỗi bên có thể chấm dứt hợp tác với thông báo trước 30 ngày; các chuyến đã nhận khách vẫn được thực hiện.');

alter table public.tour_operators
  add column operator_type text check (operator_type is null or operator_type in ('food_tour', 'experience', 'travel_agency', 'freelance_guide')),
  add column cities text[] not null default '{}' check (cardinality(cities) <= 10),
  add column contact_name text check (contact_name is null or char_length(btrim(contact_name)) between 2 and 120),
  add column contact_role text check (contact_role is null or contact_role in ('owner', 'manager')),
  add column phone text check (phone is null or char_length(btrim(phone)) between 8 and 20),
  add column website text check (website is null or (website ~ '^https?://' and char_length(website) <= 300)),
  add column business_license text check (business_license is null or char_length(business_license) <= 50),
  add column travel_license text check (travel_license is null or char_length(travel_license) <= 50),
  add column guide_card text check (guide_card is null or char_length(guide_card) <= 30),
  add column tax_code text check (tax_code is null or tax_code ~ '^[0-9-]{10,14}$'),
  add column description text check (description is null or char_length(description) <= 2000),
  add column logo_url text check (logo_url is null or (logo_url ~ '^https://' and char_length(logo_url) <= 500)),
  add column terms_version int references public.partner_terms (version),
  add column terms_accepted_at timestamptz;

-- The sign-up. The terms accepted must be tour terms; the time is the server's.
create function public.tour_apply_details(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_phone text := btrim(coalesce(p->>'phone', ''));
  v_contact text := btrim(coalesce(p->>'contact_name', ''));
  v_terms int := (p->>'terms_version')::int;
  v_cities text[] := coalesce((select array_agg(left(btrim(c), 80)) from jsonb_array_elements_text(
    case when jsonb_typeof(p->'cities') = 'array' then p->'cities' else '[]'::jsonb end) as x(c) where btrim(c) <> ''), '{}');
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if v_terms is null or not exists (select 1 from public.partner_terms where version = v_terms and kind = 'tour') then raise exception 'terms-required'; end if;
  if cardinality(v_cities) = 0 then raise exception 'cities-required'; end if;
  insert into public.tour_operators (applicant_id, name, contact, operator_type, cities, contact_name, contact_role, phone, website,
      business_license, travel_license, guide_card, tax_code, description, terms_version, terms_accepted_at)
    values (auth.uid(), v_name, left(v_contact || ' · ' || v_phone, 300), nullif(p->>'operator_type', ''), v_cities[1:10], v_contact,
      coalesce(nullif(p->>'contact_role', ''), 'owner'), v_phone, nullif(btrim(coalesce(p->>'website', '')), ''),
      nullif(btrim(coalesce(p->>'business_license', '')), ''), nullif(btrim(coalesce(p->>'travel_license', '')), ''),
      nullif(btrim(coalesce(p->>'guide_card', '')), ''), nullif(btrim(coalesce(p->>'tax_code', '')), ''),
      nullif(btrim(coalesce(p->>'description', '')), ''), v_terms, now())
    returning id into v;
  insert into public.tour_members (operator_id, user_id, role, display_name) values (v, auth.uid(), 'owner', v_name);
  return v;
end $$;
revoke all on function public.tour_apply_details(jsonb) from public, anon;
grant execute on function public.tour_apply_details(jsonb) to authenticated;

-- The approved operator's own profile, as travellers will see it.
create function public.tour_operator_update_profile(p_operator uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_logo text := nullif(btrim(coalesce(p->>'logo_url', '')), '');
begin
  if not exists (select 1 from public.tour_members m join public.tour_operators o on o.id = m.operator_id
    where m.operator_id = p_operator and m.user_id = auth.uid() and m.role = 'owner' and o.status = 'approved') then raise exception 'owners-only'; end if;
  if v_logo is not null and v_logo !~ '^https://' then raise exception 'invalid-photo-url'; end if;
  update public.tour_operators set
    description = nullif(btrim(coalesce(p->>'description', '')), ''),
    logo_url = v_logo,
    website = nullif(btrim(coalesce(p->>'website', '')), ''),
    operator_type = nullif(p->>'operator_type', ''),
    cities = coalesce((select array_agg(left(btrim(c), 80)) from jsonb_array_elements_text(
      case when jsonb_typeof(p->'cities') = 'array' then p->'cities' else '[]'::jsonb end) as x(c) where btrim(c) <> ''), '{}')
  where id = p_operator;
  perform public.admin_log('tour.operator_profile_updated', 'tour_operators', p_operator::text);
end $$;
revoke all on function public.tour_operator_update_profile(uuid, jsonb) from public, anon;
grant execute on function public.tour_operator_update_profile(uuid, jsonb) to authenticated;

create function public.tour_accept_terms(p_operator uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tour_members m join public.tour_operators o on o.id = m.operator_id
    where m.operator_id = p_operator and m.user_id = auth.uid() and m.role = 'owner' and o.status = 'approved') then raise exception 'owners-only'; end if;
  if not exists (select 1 from public.partner_terms where version = p_version and kind = 'tour') then raise exception 'terms-required'; end if;
  update public.tour_operators set terms_version = p_version, terms_accepted_at = now() where id = p_operator;
  perform public.admin_log('tour.terms_accepted', 'tour_operators', p_operator::text, jsonb_build_object('version', p_version));
end $$;
revoke all on function public.tour_accept_terms(uuid, int) from public, anon;
grant execute on function public.tour_accept_terms(uuid, int) to authenticated;

-- A tour's publish checklist. Internal for the trigger; the wrapper answers
-- only the operator's managers and admins.
create function public.tour_readiness_internal(p_tour uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'operator', char_length(coalesce(o.description, '')) >= 30 and o.terms_accepted_at is not null,
    'photos', cardinality(t.gallery) >= 3,
    'summary', char_length(coalesce(t.summary, '')) >= 30,
    'schedule', jsonb_array_length(t.schedule) >= 1,
    'includes', cardinality(t.includes) >= 1,
    'cancel_policy', char_length(coalesce(t.cancel_policy, '')) >= 10,
    'departure', exists (select 1 from public.tour_departures d where d.tour_id = t.id and d.status = 'open' and d.starts_at > now()))
  from public.tours t join public.tour_operators o on o.id = t.operator_id
  where t.id = p_tour
$$;
revoke all on function public.tour_readiness_internal(uuid) from public, anon, authenticated;

create function public.tour_readiness(p_tour uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.tour_readiness_internal(t.id) from public.tours t
  where t.id = p_tour and (public.tour_can_manage(t.operator_id) or public.is_admin())
$$;
revoke all on function public.tour_readiness(uuid) from public, anon;
grant execute on function public.tour_readiness(uuid) to authenticated;

-- Publishing needs every item; hiding a tour never does.
create function public.guard_tour_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; missing text;
begin
  if new.published and not coalesce(old.published, false) then
    r := public.tour_readiness_internal(new.id);
    select string_agg(key, ',') into missing from jsonb_each(r) where value = 'false'::jsonb;
    if missing is not null then raise exception 'tour-incomplete:%', missing using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_tour_publish() from public, anon, authenticated;
create trigger tours_publish_guard before update of published on public.tours
  for each row execute function public.guard_tour_publish();

notify pgrst, 'reload schema';
commit;
