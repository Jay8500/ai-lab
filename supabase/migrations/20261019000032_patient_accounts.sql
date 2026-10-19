-- Patient accounts (Google sign-in). Self-created accounts are patients — never staff.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','platform_admin','lab_owner','lab_staff','patient'));
alter table public.profiles alter column role set default 'patient';

-- Staff accounts are created by admins (role set in app_metadata / by admin-users). Anything else is a patient.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, role, tenant_id, avatar_url)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce(new.raw_app_meta_data->>'role', 'patient'),
    nullif(new.raw_app_meta_data->>'tenant_id','')::uuid,
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end $$;

-- Patients can't drop files into the support area
drop policy if exists support_insert on storage.objects;
create policy support_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support' and coalesce(my_role(), 'patient') <> 'patient'
              and (is_super_admin() or (storage.foldername(name))[1] = coalesce(my_tenant_id()::text, 'platform')));

-- ───── Which lab records belong to which patient account ─────
-- A patient proves ownership once (secret link key or token + mobile last 4); after that every visit
-- at that lab with the same mobile appears under "My reports".
create table if not exists public.patient_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mobile text,
  visit_id uuid references public.visits(id) on delete cascade,
  via text not null check (via in ('key','mobile')),
  created_at timestamptz not null default now()
);
create unique index if not exists patient_links_mobile on public.patient_links(user_id, tenant_id, mobile) where mobile is not null;
create unique index if not exists patient_links_visit on public.patient_links(user_id, visit_id) where visit_id is not null;
alter table public.patient_links enable row level security;
drop policy if exists links_own_read on public.patient_links;
create policy links_own_read on public.patient_links for select to authenticated using (user_id = auth.uid());
drop policy if exists links_own_delete on public.patient_links;
create policy links_own_delete on public.patient_links for delete to authenticated using (user_id = auth.uid());

alter table public.test_bookings add column if not exists user_id uuid references auth.users(id) on delete set null;
create or replace function public.test_bookings_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.my_role() = 'patient' then new.user_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists test_bookings_owner on public.test_bookings;
create trigger test_bookings_owner before insert on public.test_bookings for each row execute function public.test_bookings_owner();

/** Signed-in patient adds a report to their account (same proof as the tracking page, same try limit). */
create or replace function public.link_patient(p_slug text, p_token text, p_key text default null, p_last4 text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v visits; v_access text; v_mobile text;
begin
  if auth.uid() is null or public.my_role() <> 'patient' then raise exception 'permission denied'; end if;
  select vv.* into v from visits vv join tenants t on t.id = vv.tenant_id
   where t.slug = lower(p_slug) and upper(vv.token) = upper(trim(p_token)) limit 1;
  if v.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_access := public.track_access(v, p_key, p_last4);
  if v_access <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_access); end if;
  v_mobile := nullif(regexp_replace(coalesce(v.mobile, ''), '\D', '', 'g'), '');
  if v_mobile is not null then
    insert into patient_links (user_id, tenant_id, mobile, via) values (auth.uid(), v.tenant_id, v_mobile, case when p_key is not null and p_key = v.access_key then 'key' else 'mobile' end)
    on conflict do nothing;
  else
    insert into patient_links (user_id, tenant_id, visit_id, via) values (auth.uid(), v.tenant_id, v.id, 'key') on conflict do nothing;
  end if;
  perform public.log_activity(v.tenant_id, 'visit', v.id, 'patient_linked', 'Patient added this report to their account', jsonb_build_object('token', v.token));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.link_patient(text, text, text, text) to authenticated;

/** Everything a signed-in patient has at this lab: visits (with their secret links) and bookings. */
create or replace function public.my_lab_records(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t tenants;
begin
  if auth.uid() is null or public.my_role() <> 'patient' then return null; end if;
  select * into t from tenants where slug = lower(p_slug);
  if t.id is null then return null; end if;
  return jsonb_build_object(
    'linked', exists (select 1 from patient_links l where l.user_id = auth.uid() and l.tenant_id = t.id),
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
        'token', v.token, 'key', v.access_key, 'patient_name', v.patient_name, 'status', v.status, 'created_at', v.created_at,
        'tests', (select coalesce(jsonb_agg(jsonb_build_object('code', x->>'code', 'name', x->>'name')), '[]'::jsonb) from jsonb_array_elements(v.tests) x),
        'report_path', case when v.status in ('ready','delivered') then v.report_path end,
        'ai_values', case when v.ai_status = 'done' and v.status in ('ready','delivered') then v.ai_values end)
      order by v.created_at desc)
      from visits v where v.tenant_id = t.id and exists (select 1 from patient_links l where l.user_id = auth.uid() and l.tenant_id = t.id
        and ((l.mobile is not null and regexp_replace(coalesce(v.mobile, ''), '\D', '', 'g') = l.mobile) or l.visit_id = v.id))), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
        'ref', b.ref, 'status', b.status, 'status_note', b.status_note, 'preferred_date', b.preferred_date, 'slot', b.slot,
        'collection', b.collection, 'tests', b.tests, 'amount', b.amount, 'created_at', b.created_at) order by b.created_at desc)
      from test_bookings b where b.tenant_id = t.id and (b.user_id = auth.uid()
        or exists (select 1 from patient_links l where l.user_id = auth.uid() and l.tenant_id = t.id and l.mobile = b.mobile))), '[]'::jsonb)
  );
end $$;
grant execute on function public.my_lab_records(text) to authenticated;
