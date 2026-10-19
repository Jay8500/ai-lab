-- 1) Secure patient tracking: secret link key + mobile check, attempt limits, no mobile hint.
-- 2) Online test bookings from the lab's website (no login), with private prescription uploads.

-- ───── 1. Secure tracking ─────
alter table public.visits add column if not exists access_key text;
update public.visits set access_key = encode(extensions.gen_random_bytes(9), 'hex') where access_key is null;
alter table public.visits alter column access_key set default encode(extensions.gen_random_bytes(9), 'hex');
alter table public.visits alter column access_key set not null;

create table if not exists public.track_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  token text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists track_attempts_lookup on public.track_attempts(tenant_id, token, at desc);
alter table public.track_attempts enable row level security; -- no policies: only security-definer functions touch it

/**
 * Can the caller see this visit's details?
 *   'key'    — secret key from the WhatsApp link / receipt QR
 *   'mobile' — last 4 digits of the registered mobile (max 5 wrong tries per token per 15 min)
 * Returns 'ok' | 'locked' (needs verification) | 'blocked' (too many wrong tries) | 'wrong'.
 */
create or replace function public.track_access(v visits, p_key text, p_last4 text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_fails int;
begin
  if p_key is not null and p_key <> '' and p_key = v.access_key then return 'ok'; end if;
  if p_last4 is null or p_last4 = '' then return 'locked'; end if;
  select count(*) into v_fails from track_attempts
   where tenant_id = v.tenant_id and token = v.token and not ok and at > now() - interval '15 minutes';
  if v_fails >= 5 then return 'blocked'; end if;
  if v.mobile is not null and right(regexp_replace(v.mobile, '\D', '', 'g'), 4) = regexp_replace(p_last4, '\D', '', 'g') then
    insert into track_attempts (tenant_id, token, ok) values (v.tenant_id, v.token, true);
    return 'ok';
  end if;
  insert into track_attempts (tenant_id, token, ok) values (v.tenant_id, v.token, false);
  return case when v_fails + 1 >= 5 then 'blocked' else 'wrong' end;
end $$;
revoke all on function public.track_access(visits, text, text) from public, anon, authenticated;

drop function if exists public.track_visit(text, text);
create or replace function public.track_visit(p_slug text, p_token text, p_key text default null, p_last4 text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v visits; v_access text;
begin
  select vv.* into v from visits vv join tenants t on t.id = vv.tenant_id
   where t.slug = lower(p_slug) and upper(vv.token) = upper(trim(p_token)) limit 1;
  if v.id is null then return null; end if;
  v_access := public.track_access(v, p_key, p_last4);
  if v_access <> 'ok' then
    -- Progress only: nothing that identifies the patient or their tests
    return jsonb_build_object('token', v.token, 'status', v.status, 'created_at', v.created_at,
      'locked', true, 'access', v_access, 'can_verify', v.mobile is not null);
  end if;
  return jsonb_build_object(
    'token', v.token, 'locked', false,
    'patient_name', v.patient_name, 'age', v.age, 'gender', v.gender,
    'tests', (select coalesce(jsonb_agg(jsonb_build_object('code', t->>'code', 'name', t->>'name')), '[]'::jsonb) from jsonb_array_elements(v.tests) t),
    'status', v.status,
    'report_path', case when v.status in ('ready','delivered') then v.report_path end,
    'report_name', v.report_name, 'report_uploaded_at', v.report_uploaded_at,
    'ai_summary', case when v.ai_status = 'done' then v.ai_summary end,
    'ai_values', case when v.ai_status = 'done' and v.status in ('ready','delivered') then v.ai_values end,
    'ai_status', v.ai_status, 'created_at', v.created_at
  );
end $$;
grant execute on function public.track_visit(text, text, text, text) to anon, authenticated;

drop function if exists public.track_history(text, text);
create or replace function public.track_history(p_slug text, p_token text, p_key text default null, p_last4 text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v visits; v_access text;
begin
  select vv.* into v from visits vv join tenants t on t.id = vv.tenant_id
   where t.slug = lower(p_slug) and upper(vv.token) = upper(trim(p_token)) limit 1;
  if v.id is null then return null; end if;
  -- the visit's own progress is fine to show; earlier visits only after access is proven
  v_access := case when (p_key is not null and p_key = v.access_key) then 'ok'
                   when p_last4 is not null and v.mobile is not null
                        and right(regexp_replace(v.mobile, '\D', '', 'g'), 4) = regexp_replace(p_last4, '\D', '', 'g') then 'ok'
                   else 'locked' end;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at) order by a.created_at desc)
                        from activity_log a where a.entity = 'visit' and a.entity_id = v.id
                          and (v_access = 'ok' or a.action in ('registered','in_lab','verified','ready','delivered'))), '[]'::jsonb),
    'previous', case when v_access <> 'ok' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
                    'token', p.token, 'created_at', p.created_at, 'status', p.status,
                    'tests', (select coalesce(jsonb_agg(jsonb_build_object('code', t->>'code', 'name', t->>'name')), '[]'::jsonb) from jsonb_array_elements(p.tests) t),
                    'report_path', case when p.status in ('ready','delivered') then p.report_path end,
                    'ai_values', case when p.ai_status = 'done' and p.status in ('ready','delivered') then p.ai_values end)
                  order by p.created_at desc)
                from visits p where p.tenant_id = v.tenant_id and v.mobile is not null and p.mobile = v.mobile and p.id <> v.id), '[]'::jsonb) end
  );
end $$;
grant execute on function public.track_history(text, text, text, text) to anon, authenticated;

-- ───── 2. Online bookings ─────
create table if not exists public.test_bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ref text not null,
  patient_name text not null,
  mobile text not null,
  email text,
  age int check (age is null or age between 0 and 120),
  gender text check (gender in ('M','F','O')),
  tests jsonb not null,
  amount numeric not null default 0,
  preferred_date date not null,
  slot text not null check (slot in ('morning','afternoon','evening')),
  collection text not null default 'lab' check (collection in ('lab','home')),
  address text,
  notes text,
  prescription_path text,
  consent_at timestamptz not null,
  consent_version text not null,
  status text not null default 'requested' check (status in ('requested','confirmed','cancelled','completed')),
  status_note text,
  visit_id uuid references public.visits(id) on delete set null,
  handled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ref)
);
create index if not exists test_bookings_tenant on public.test_bookings(tenant_id, created_at desc);
alter table public.test_bookings enable row level security;
drop policy if exists bookings_admin on public.test_bookings;
create policy bookings_admin on public.test_bookings for all to authenticated using (is_super_admin()) with check (is_super_admin());
drop policy if exists bookings_lab_read on public.test_bookings;
create policy bookings_lab_read on public.test_bookings for select to authenticated using (tenant_id = my_tenant_id());
drop policy if exists bookings_lab_update on public.test_bookings;
create policy bookings_lab_update on public.test_bookings for update to authenticated
  using (tenant_id = my_tenant_id()) with check (tenant_id = my_tenant_id());

do $$ begin
  alter publication supabase_realtime add table public.test_bookings;
exception when duplicate_object then null; end $$;

/** Patient books tests from the lab's website. Prices come from the lab's catalogue, never from the browser. */
create or replace function public.submit_booking(
  p_slug text, p_name text, p_mobile text, p_age int, p_gender text, p_tests text[],
  p_date date, p_slot text, p_collection text, p_address text, p_notes text,
  p_prescription text, p_consent_version text, p_email text default null)
returns text language plpgsql security definer set search_path = public as $$
declare t tenants; v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'); v_tests jsonb; v_amount numeric; v_ref text; v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select * into t from tenants where slug = lower(p_slug);
  if t.id is null then raise exception 'invalid input: lab'; end if;
  if not public.tenant_is_usable(t.id) or coalesce((t.pages->>'show_booking')::boolean, true) = false then
    raise exception 'bookings are not open for this lab';
  end if;
  if char_length(v_name) not between 2 and 80 or v_name !~ '^[[:alpha:]][[:alpha:] .''()-]*$' then raise exception 'invalid input: name'; end if;
  if v_mobile ~ '^91\d{10}$' then v_mobile := right(v_mobile, 10); end if;
  if v_mobile !~ '^[6-9]\d{9}$' then raise exception 'invalid input: mobile'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$' then raise exception 'invalid input: email'; end if;
  if p_gender not in ('M','F','O') then raise exception 'invalid input: gender'; end if;
  if p_age is not null and (p_age < 0 or p_age > 120) then raise exception 'invalid input: age'; end if;
  if p_date is null or p_date < current_date or p_date > current_date + 60 then raise exception 'invalid input: date'; end if;
  if p_slot not in ('morning','afternoon','evening') then raise exception 'invalid input: slot'; end if;
  if p_collection not in ('lab','home') then raise exception 'invalid input: collection'; end if;
  if p_collection = 'home' and (coalesce((t.pages->>'home_collection')::boolean, false) = false) then raise exception 'invalid input: home collection not offered'; end if;
  if p_collection = 'home' and char_length(trim(coalesce(p_address, ''))) < 10 then raise exception 'invalid input: address'; end if;
  if p_prescription is not null and p_prescription !~ ('^' || t.id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$') then raise exception 'invalid input: prescription'; end if;
  if coalesce(p_consent_version, '') = '' then raise exception 'invalid input: consent'; end if;
  -- tests must exist in this lab's catalogue; prices from the catalogue
  select jsonb_agg(jsonb_build_object('code', c->>'code', 'name', c->>'name', 'price', (c->>'price')::numeric)), sum((c->>'price')::numeric)
    into v_tests, v_amount
    from jsonb_array_elements(t.test_catalog) c where c->>'code' = any(p_tests);
  if v_tests is null and (p_prescription is null) then raise exception 'invalid input: tests'; end if;
  if coalesce(array_length(p_tests, 1), 0) > 30 then raise exception 'invalid input: tests'; end if;
  -- flood guard: 3 open requests per mobile per lab per day, 60 per lab per hour
  if (select count(*) from test_bookings b where b.tenant_id = t.id and b.mobile = v_mobile and b.created_at > now() - interval '1 day') >= 3
     or (select count(*) from test_bookings b where b.tenant_id = t.id and b.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate limit';
  end if;
  v_ref := 'BK-' || upper(encode(extensions.gen_random_bytes(3), 'hex'));
  insert into test_bookings (tenant_id, ref, patient_name, mobile, email, age, gender, tests, amount, preferred_date, slot, collection, address, notes, prescription_path, consent_at, consent_version)
  values (t.id, v_ref, v_name, v_mobile, nullif(trim(coalesce(p_email, '')), ''), p_age, p_gender, coalesce(v_tests, '[]'::jsonb), coalesce(v_amount, 0),
          p_date, p_slot, p_collection, nullif(left(trim(coalesce(p_address, '')), 300), ''), nullif(left(trim(coalesce(p_notes, '')), 500), ''),
          p_prescription, now(), p_consent_version);
  perform public.log_activity(t.id, 'booking', (select id from test_bookings where tenant_id = t.id and ref = v_ref), 'requested',
    'Online booking ' || v_ref || ' · ' || v_name || coalesce(' · ' || (select string_agg(x->>'code', ', ') from jsonb_array_elements(v_tests) x), ''));
  return v_ref;
end $$;
grant execute on function public.submit_booking(text, text, text, int, text, text[], date, text, text, text, text, text, text, text) to anon, authenticated;

/** Patient checks a booking: reference + last 4 digits of the mobile used. */
create or replace function public.booking_status(p_slug text, p_ref text, p_last4 text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare b test_bookings; t tenants; v_token text; v_key text; v_fails int;
begin
  select * into t from tenants where slug = lower(p_slug);
  if t.id is null then return null; end if;
  select count(*) into v_fails from track_attempts where tenant_id = t.id and token = upper(trim(p_ref)) and not ok and at > now() - interval '15 minutes';
  if v_fails >= 5 then return jsonb_build_object('blocked', true); end if;
  select * into b from test_bookings where tenant_id = t.id and ref = upper(trim(p_ref));
  if b.id is null or right(b.mobile, 4) <> regexp_replace(coalesce(p_last4, ''), '\D', '', 'g') then
    insert into track_attempts (tenant_id, token, ok) values (t.id, upper(trim(p_ref)), false);
    return null;
  end if;
  if b.visit_id is not null then select token, access_key into v_token, v_key from visits where id = b.visit_id; end if;
  return jsonb_build_object('ref', b.ref, 'status', b.status, 'status_note', b.status_note, 'preferred_date', b.preferred_date, 'slot', b.slot,
    'collection', b.collection, 'tests', b.tests, 'amount', b.amount, 'token', v_token, 'key', v_key, 'created_at', b.created_at);
end $$;
grant execute on function public.booking_status(text, text, text) to anon, authenticated;

-- Prescriptions: private bucket; anyone may upload into a lab's folder (random name), only that lab can read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions', 'prescriptions', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists rx_upload on storage.objects;
create policy rx_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'prescriptions'
              and (storage.foldername(name))[1] in (select id::text from tenants)
              and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$');
drop policy if exists rx_read on storage.objects;
create policy rx_read on storage.objects for select to authenticated
  using (bucket_id = 'prescriptions' and ((storage.foldername(name))[1] = my_tenant_id()::text or is_super_admin()));
