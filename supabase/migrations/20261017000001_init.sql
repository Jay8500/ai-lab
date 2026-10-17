-- SpreadApps AI-Lab : multi-tenant diagnostic lab platform
-- Roles: super_admin (SpreadApps), lab_owner / lab_staff (tenant), patients (anonymous, token based)

create extension if not exists pgcrypto;

-- ───────────────────────── Plans (revenue models) ─────────────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  billing_model text not null default 'monthly'
    check (billing_model in ('free','monthly','yearly','per_report','revenue_share','hybrid')),
  price numeric(12,2) not null default 0,           -- monthly / yearly fee
  per_report_fee numeric(12,2) not null default 0,  -- per delivered report
  revenue_share_pct numeric(5,2) not null default 0,
  report_quota int,                                  -- null = unlimited
  setup_fee numeric(12,2) not null default 0,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Tenants (labs) ─────────────────────────
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null,
  tagline text,
  logo_url text,
  favicon_url text,
  cover_url text,
  brand_color text not null default '#6366F1',
  accent_color text not null default '#10B981',
  contact_phone text,
  contact_email text,
  whatsapp_number text,
  address text,
  custom_domain text unique,
  token_prefix text not null default 'LAB',
  status text not null default 'trial' check (status in ('trial','active','suspended','expired')),
  plan_id uuid references public.plans(id),
  custom_price numeric(12,2),                       -- override plan price for this client
  trial_days int not null default 14,
  trial_started_at timestamptz not null default now(),
  subscription_ends_at timestamptz,
  pages jsonb not null default '{}'::jsonb,          -- cover/login copy + feature toggles
  test_catalog jsonb not null default '[]'::jsonb,   -- [{code,name,price,tat_hours}]
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Secrets are only ever readable by super admins (and service-role edge functions)
create table public.tenant_secrets (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  whatsapp_provider text,
  whatsapp_api_key text,
  whatsapp_phone_id text,
  sms_provider text,
  sms_api_key text,
  sms_sender_id text,
  razorpay_key_id text,
  razorpay_key_secret text,
  ai_provider text,
  ai_api_key text,
  circles_project_id text,
  circles_api_key text,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'lab_staff' check (role in ('super_admin','lab_owner','lab_staff')),
  tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Visits (patient + tests + report) ─────────────────────────
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token text not null,
  patient_name text not null,
  mobile text,
  age int,
  gender text check (gender in ('M','F','O')),
  tests jsonb not null default '[]'::jsonb,
  amount numeric(12,2) not null default 0,
  status text not null default 'collected' check (status in ('collected','in_lab','verified','ready','delivered')),
  report_path text,
  report_name text,
  report_uploaded_at timestamptz,
  notified_at timestamptz,
  delivered_at timestamptz,
  ai_summary text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, token)
);
create index visits_tenant_created on public.visits(tenant_id, created_at desc);

-- ───────────────────────── Support tickets (Circles bridge) ─────────────────────────
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  created_by uuid references auth.users(id),
  reporter_email text,
  summary text not null,
  details text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  screenshot_path text,
  page_url text,
  status text not null default 'open' check (status in ('open','synced','in_progress','resolved','closed')),
  circles_ref text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Billing ledger ─────────────────────────
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('subscription','per_report','revenue_share','setup','adjustment')),
  amount numeric(12,2) not null,
  period text,                       -- e.g. 2026-10
  status text not null default 'due' check (status in ('due','paid','waived')),
  note text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Platform settings (key/value) ─────────────────────────
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.my_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid();
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.tenant_trial_ends(t public.tenants) returns timestamptz
language sql immutable as $$ select t.trial_started_at + make_interval(days => t.trial_days) $$;

create or replace function public.tenant_is_usable(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from tenants t where t.id = p_tenant and (
      (t.status = 'active' and (t.subscription_ends_at is null or t.subscription_ends_at > now()))
      or (t.status = 'trial' and now() < t.trial_started_at + make_interval(days => t.trial_days))
    ));
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger tenants_touch before update on public.tenants for each row execute function touch_updated_at();
create trigger visits_touch before update on public.visits for each row execute function touch_updated_at();

-- Token generator: PREFIX-MMDD-### per tenant per day
create or replace function public.visits_assign_token() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_seq int;
begin
  if new.token is null or new.token = '' then
    select token_prefix into v_prefix from tenants where id = new.tenant_id;
    select count(*) + 1 into v_seq from visits
      where tenant_id = new.tenant_id and created_at >= date_trunc('day', now());
    new.token := upper(coalesce(v_prefix,'LAB')) || '-' || to_char(now() at time zone 'Asia/Kolkata','MMDD')
                 || '-' || lpad(v_seq::text, 3, '0');
    while exists(select 1 from visits where tenant_id = new.tenant_id and token = new.token) loop
      v_seq := v_seq + 1;
      new.token := upper(coalesce(v_prefix,'LAB')) || '-' || to_char(now() at time zone 'Asia/Kolkata','MMDD')
                   || '-' || lpad(v_seq::text, 3, '0');
    end loop;
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger visits_token before insert on public.visits for each row execute function visits_assign_token();

-- New auth user → profile (role/tenant come from admin-users edge function metadata)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, role, tenant_id)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.raw_app_meta_data->>'role', 'lab_staff'),
    nullif(new.raw_app_meta_data->>'tenant_id','')::uuid
  ) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ───────────────────────── Public RPCs (anon) ─────────────────────────
-- Branding for cover / login / patient portal. Never exposes secrets or billing.
create or replace function public.resolve_tenant(p_slug text default null, p_domain text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.name, 'tagline', t.tagline,
    'logo_url', t.logo_url, 'favicon_url', t.favicon_url, 'cover_url', t.cover_url,
    'brand_color', t.brand_color, 'accent_color', t.accent_color,
    'contact_phone', t.contact_phone, 'contact_email', t.contact_email,
    'whatsapp_number', t.whatsapp_number, 'address', t.address,
    'status', t.status, 'trial_ends_at', t.trial_started_at + make_interval(days => t.trial_days),
    'usable', public.tenant_is_usable(t.id),
    'pages', t.pages, 'test_catalog', t.test_catalog
  )
  from tenants t
  where (p_slug is not null and t.slug = lower(p_slug))
     or (p_domain is not null and t.custom_domain = lower(p_domain))
  limit 1;
$$;

-- Patient tracking by token (+ optional last-4 mobile check)
create or replace function public.track_visit(p_slug text, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'token', v.token,
    'patient_name', v.patient_name,
    'age', v.age, 'gender', v.gender,
    'tests', v.tests, 'status', v.status,
    'report_path', case when v.status in ('ready','delivered') then v.report_path end,
    'report_name', v.report_name,
    'report_uploaded_at', v.report_uploaded_at,
    'ai_summary', v.ai_summary,
    'created_at', v.created_at,
    'mobile_hint', right(coalesce(v.mobile,''), 4)
  )
  from visits v join tenants t on t.id = v.tenant_id
  where t.slug = lower(p_slug) and upper(v.token) = upper(trim(p_token))
  limit 1;
$$;

grant execute on function public.resolve_tenant(text, text) to anon, authenticated;
grant execute on function public.track_visit(text, text) to anon, authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_secrets enable row level security;
alter table public.profiles enable row level security;
alter table public.visits enable row level security;
alter table public.support_tickets enable row level security;
alter table public.billing_events enable row level security;
alter table public.platform_settings enable row level security;

create policy plans_read on public.plans for select to authenticated using (true);
create policy plans_admin on public.plans for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy tenants_read on public.tenants for select to authenticated using (is_super_admin() or id = my_tenant_id());
create policy tenants_admin on public.tenants for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy secrets_admin on public.tenant_secrets for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_super_admin() or (tenant_id is not null and tenant_id = my_tenant_id() and my_role() = 'lab_owner'));
create policy profiles_admin on public.profiles for all to authenticated using (is_super_admin()) with check (is_super_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = my_role() and tenant_id is not distinct from my_tenant_id());

create policy visits_admin on public.visits for all to authenticated using (is_super_admin()) with check (is_super_admin());
create policy visits_tenant_read on public.visits for select to authenticated using (tenant_id = my_tenant_id());
create policy visits_tenant_insert on public.visits for insert to authenticated
  with check (tenant_id = my_tenant_id() and tenant_is_usable(tenant_id));
create policy visits_tenant_update on public.visits for update to authenticated
  using (tenant_id = my_tenant_id()) with check (tenant_id = my_tenant_id() and tenant_is_usable(tenant_id));
create policy visits_owner_delete on public.visits for delete to authenticated
  using (tenant_id = my_tenant_id() and my_role() = 'lab_owner');

create policy tickets_admin on public.support_tickets for all to authenticated using (is_super_admin()) with check (is_super_admin());
create policy tickets_tenant_read on public.support_tickets for select to authenticated using (tenant_id = my_tenant_id());
create policy tickets_tenant_insert on public.support_tickets for insert to authenticated
  with check (tenant_id = my_tenant_id() and created_by = auth.uid());

create policy billing_admin on public.billing_events for all to authenticated using (is_super_admin()) with check (is_super_admin());
create policy billing_owner_read on public.billing_events for select to authenticated
  using (tenant_id = my_tenant_id() and my_role() = 'lab_owner');

create policy settings_admin on public.platform_settings for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- ───────────────────────── Storage ─────────────────────────
-- reports: public read via unguessable path  <tenant_id>/<visit_id>/<random>.pdf
-- branding: public logos / favicons / covers (admin writes)
-- support: private screenshots
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('reports',  'reports',  true,  20971520, array['application/pdf']),
  ('branding', 'branding', true,  5242880,  array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon']),
  ('support',  'support',  false, 5242880,  array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy reports_tenant_write on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and ((storage.foldername(name))[1] = my_tenant_id()::text or is_super_admin()));
create policy reports_tenant_update on storage.objects for update to authenticated
  using (bucket_id = 'reports' and ((storage.foldername(name))[1] = my_tenant_id()::text or is_super_admin()));
create policy reports_tenant_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and ((storage.foldername(name))[1] = my_tenant_id()::text or is_super_admin()));

create policy branding_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and is_super_admin());
create policy branding_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and is_super_admin());
create policy branding_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and is_super_admin());

create policy support_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support' and (storage.foldername(name))[1] = coalesce(my_tenant_id()::text, 'platform'));
create policy support_read on storage.objects for select to authenticated
  using (bucket_id = 'support' and (is_super_admin() or (storage.foldername(name))[1] = my_tenant_id()::text));

-- ───────────────────────── Seed ─────────────────────────
insert into public.plans (code, name, billing_model, price, per_report_fee, revenue_share_pct, report_quota, setup_fee, features) values
  ('trial',   'Free Trial',      'free',          0,    0,  0, 200,  0,    '{"ai_explain":true,"whatsapp":false,"circles":true}'),
  ('starter', 'Starter',         'monthly',       999,  0,  0, 1500, 0,    '{"ai_explain":false,"whatsapp":true,"circles":true}'),
  ('growth',  'Growth',          'monthly',       2499, 0,  0, null, 0,    '{"ai_explain":true,"whatsapp":true,"circles":true}'),
  ('payg',    'Pay per Report',  'per_report',    0,    3,  0, null, 1999, '{"ai_explain":true,"whatsapp":true,"circles":true}'),
  ('annual',  'Growth Annual',   'yearly',        24999,0,  0, null, 0,    '{"ai_explain":true,"whatsapp":true,"circles":true}');

insert into public.tenants (slug, name, tagline, brand_color, token_prefix, status, plan_id, trial_days, contact_phone, address, pages, test_catalog)
select 'srisai', 'Sri Sai Diagnostics', 'Accurate reports. Delivered on time.', '#6366F1', 'SRS', 'trial', p.id, 14,
  '+91 90000 00000', 'Main Road, Hyderabad',
  '{"hero_title":"Your health reports, right on your phone","hero_subtitle":"Track your sample live and download your official report the moment it is verified.","show_track":true,"show_ai":true,"show_support":true,"show_whatsapp":true,"login_title":"Staff sign in"}',
  '[{"code":"CBP","name":"Complete Blood Picture","price":350,"tat_hours":6},
    {"code":"FBS","name":"Fasting Blood Sugar","price":120,"tat_hours":3},
    {"code":"PPBS","name":"Post Prandial Sugar","price":120,"tat_hours":3},
    {"code":"TSH","name":"Thyroid Profile (T3,T4,TSH)","price":600,"tat_hours":12},
    {"code":"LFT","name":"Liver Function Test","price":750,"tat_hours":12},
    {"code":"LIPID","name":"Lipid Profile","price":650,"tat_hours":12},
    {"code":"HBA1C","name":"HbA1c","price":500,"tat_hours":8},
    {"code":"CUE","name":"Complete Urine Exam","price":200,"tat_hours":4}]'
from public.plans p where p.code = 'trial';

insert into public.tenant_secrets (tenant_id) select id from public.tenants where slug = 'srisai';

insert into public.platform_settings (key, value) values
  ('circles', '{"enabled":true,"api_url":"","project_id":"","note":"Tickets are stored locally and synced to Circles when api_url is set."}'),
  ('brand', '{"name":"SpreadApps","product":"AI-Lab","support_email":"support@spreadapps.in","base_domain":"spreadapps.in"}');
