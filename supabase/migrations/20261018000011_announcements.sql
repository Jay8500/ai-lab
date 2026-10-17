-- Email announcements from SpreadApps to labs (payments, new features, maintenance...).
-- Sending happens in the "announce" edge function with the Resend key kept as a server secret.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general' check (category in ('general','payment','feature','maintenance','trial')),
  subject text not null check (char_length(trim(subject)) between 3 and 150),
  body text not null check (char_length(trim(body)) between 10 and 10000),
  audience jsonb not null default '{}'::jsonb,   -- { roles: [...], statuses: [...], tenant_ids: [...] }
  recipients int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  skipped_no_email int not null default 0,
  status text not null default 'sending' check (status in ('sending','sent','partial','failed')),
  error text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.announcements enable row level security;
create policy announcements_admin_read on public.announcements for select to authenticated using (is_super_admin());
-- writes only via the edge function (service role)

insert into public.platform_settings (key, value) values
  ('email', '{"from_name":"SpreadApps","from_email":"updates@spreadapps.in","reply_to":"support@spreadapps.in","footer":"You are receiving this because your lab uses SpreadApps AI-Lab."}')
on conflict (key) do nothing;
