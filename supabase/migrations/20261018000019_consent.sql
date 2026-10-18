-- Patient consent captured at registration (DPDP Act 2023): when, by whom, which notice version.
alter table public.visits add column if not exists consent_at timestamptz;
alter table public.visits add column if not exists consent_by text check (consent_by is null or consent_by in ('patient','guardian'));
alter table public.visits add column if not exists consent_version text;
