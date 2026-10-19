-- LIS: structured results per test, analyzer devices, device message log.

-- ───── Results: one row per visit + test ─────
-- values = { "<param key>": { "v": "13.6", "n": 13.6, "flag": "low|normal|high|abnormal|null" } }
create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  test_code text not null,
  "values" jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','entered','verified')),
  source text not null default 'manual' check (source in ('manual','device')),
  device_id uuid,
  notes text check (notes is null or char_length(notes) <= 1000),
  entered_by uuid references auth.users(id) on delete set null,
  entered_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (visit_id, test_code)
);
create index if not exists test_results_tenant on public.test_results(tenant_id, updated_at desc);
alter table public.test_results enable row level security;

/** Lab admins and staff titled Pathologist may verify results. */
create or replace function public.can_verify_results() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid()
                 and (p.role = 'lab_owner' or (p.role = 'lab_staff' and p.title = 'Pathologist')));
$$;
grant execute on function public.can_verify_results() to authenticated;

drop policy if exists results_admin on public.test_results;
create policy results_admin on public.test_results for all to authenticated using (is_super_admin()) with check (is_super_admin());
drop policy if exists results_read on public.test_results;
create policy results_read on public.test_results for select to authenticated using (tenant_id = my_tenant_id());
drop policy if exists results_write on public.test_results;
create policy results_write on public.test_results for insert to authenticated
  with check (tenant_id = my_tenant_id() and tenant_is_usable(tenant_id)
              and exists (select 1 from visits v where v.id = visit_id and v.tenant_id = tenant_id));
drop policy if exists results_update on public.test_results;
create policy results_update on public.test_results for update to authenticated
  using (tenant_id = my_tenant_id()) with check (tenant_id = my_tenant_id() and tenant_is_usable(tenant_id));
drop policy if exists results_delete on public.test_results;
create policy results_delete on public.test_results for delete to authenticated
  using (tenant_id = my_tenant_id() and status <> 'verified');

-- Stamps who entered / verified; editing a verified result sends it back for re-checking.
create or replace function public.test_results_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and old.status = 'verified' and new."values" is distinct from old."values" then
    new.status := 'entered'; new.verified_by := null; new.verified_at := null;
  end if;
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status <> 'verified') then
    if v_service or not (public.can_verify_results() or public.is_super_admin()) then
      raise exception 'permission denied: only a lab admin or pathologist can verify results';
    end if;
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  if new.status <> 'verified' then new.verified_by := null; new.verified_at := null; end if;
  if new.status in ('entered','verified') and (tg_op = 'INSERT' or new."values" is distinct from old."values") then
    new.entered_at := now();
    if not v_service then new.entered_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists test_results_guard on public.test_results;
create trigger test_results_guard before insert or update on public.test_results for each row execute function public.test_results_guard();

-- Timeline entries for results
create or replace function public.test_results_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = new.visit_id;
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status <> 'verified') then
    perform public.log_activity(new.tenant_id, 'visit', new.visit_id, 'results_verified',
      new.test_code || ' results verified for ' || v.patient_name, jsonb_build_object('token', v.token, 'test', new.test_code));
  elsif new.status = 'entered' and (tg_op = 'INSERT' or old.status = 'pending'
        or (old.source = 'manual' and new.source = 'device')) then
    perform public.log_activity(new.tenant_id, 'visit', new.visit_id, 'results_entered',
      new.test_code || ' results ' || case when new.source = 'device' then 'received from analyzer' else 'entered' end || ' for ' || v.patient_name,
      jsonb_build_object('token', v.token, 'test', new.test_code));
  end if;
  return new;
end $$;
drop trigger if exists test_results_activity on public.test_results;
create trigger test_results_activity after insert or update on public.test_results for each row execute function public.test_results_activity();

-- ───── Analyzer devices ─────
create table if not exists public.lab_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  kind text not null default 'other' check (kind in ('hematology','biochemistry','immunoassay','electrolyte','urine','coagulation','hba1c','other')),
  make text, model text,
  protocol text not null default 'astm' check (protocol in ('astm','hl7')),
  connection text not null default 'serial' check (connection in ('serial','tcp','file')),
  settings jsonb not null default '{}'::jsonb,   -- { host, port, baud, data_bits, parity, stop_bits, folder }
  mapping jsonb not null default '[]'::jsonb,    -- [{ device_code, test_code, param_key }]
  active boolean not null default true,
  key_hash text, key_hint text,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lab_devices_tenant on public.lab_devices(tenant_id);
alter table public.lab_devices enable row level security;
drop policy if exists devices_admin on public.lab_devices;
create policy devices_admin on public.lab_devices for all to authenticated using (is_super_admin()) with check (is_super_admin());
drop policy if exists devices_owner on public.lab_devices;
create policy devices_owner on public.lab_devices for all to authenticated
  using (tenant_id = my_tenant_id() and my_role() = 'lab_owner') with check (tenant_id = my_tenant_id() and my_role() = 'lab_owner');
drop policy if exists devices_staff_read on public.lab_devices;
create policy devices_staff_read on public.lab_devices for select to authenticated using (tenant_id = my_tenant_id());

-- Keys are shown once; only a SHA-256 hash is stored.
create or replace function public.rotate_device_key(p_device uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare d lab_devices; v_key text;
begin
  select * into d from lab_devices where id = p_device;
  if d.id is null or not (public.is_super_admin() or (d.tenant_id = public.my_tenant_id() and public.my_role() = 'lab_owner')) then
    raise exception 'permission denied';
  end if;
  v_key := 'sadev_' || encode(extensions.gen_random_bytes(24), 'hex');
  update lab_devices set key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex'), key_hint = right(v_key, 4) where id = p_device;
  return v_key;
end $$;
grant execute on function public.rotate_device_key(uuid) to authenticated;

-- ───── Device message log ─────
create table if not exists public.device_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid references public.lab_devices(id) on delete cascade,
  received_at timestamptz not null default now(),
  raw text,
  summary jsonb,
  status text not null check (status in ('matched','partial','unmatched','error')),
  error text,
  simulated boolean not null default false
);
create index if not exists device_messages_device on public.device_messages(device_id, received_at desc);
alter table public.device_messages enable row level security;
drop policy if exists devmsg_read on public.device_messages;
create policy devmsg_read on public.device_messages for select to authenticated
  using (is_super_admin() or (tenant_id = my_tenant_id() and my_role() = 'lab_owner'));

-- ───── Visits: log when tests are added / removed after registration ─────
create or replace function public.visits_tests_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old text; v_new text;
begin
  if new.tests is distinct from old.tests then
    select string_agg(t->>'code', ', ' order by t->>'code') into v_old from jsonb_array_elements(old.tests) t;
    select string_agg(t->>'code', ', ' order by t->>'code') into v_new from jsonb_array_elements(new.tests) t;
    if v_old is distinct from v_new then
      perform public.log_activity(new.tenant_id, 'visit', new.id, 'tests_changed',
        'Tests updated for ' || new.patient_name || ': ' || coalesce(v_new, 'none') || ' (₹' || trim(to_char(new.amount, 'FM99,99,99,990')) || ')',
        jsonb_build_object('token', new.token, 'before', v_old, 'after', v_new));
      -- results of removed tests are no longer needed (unless already verified)
      delete from test_results r where r.visit_id = new.id and r.status <> 'verified'
        and not exists (select 1 from jsonb_array_elements(new.tests) t where t->>'code' = r.test_code);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists visits_tests_activity on public.visits;
create trigger visits_tests_activity after update on public.visits for each row execute function public.visits_tests_activity();

-- Realtime for the results worklist
do $$ begin
  alter publication supabase_realtime add table public.test_results;
exception when duplicate_object then null; end $$;
