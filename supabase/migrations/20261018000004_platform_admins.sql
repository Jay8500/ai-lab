-- Role hierarchy
--   super_admin    : SpreadApps owner. Everything, incl. managing platform admins & platform settings.
--   platform_admin : SpreadApps team. Labs, plans, billing, lab admins — not other platform admins.
--   lab_owner      : a lab's admin. Own lab's admins + staff.
--   lab_staff      : a lab's employee (title says receptionist / technician / …).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin','platform_admin','lab_owner','lab_staff'));

alter table public.profiles add column if not exists title text;
alter table public.profiles add column if not exists created_by uuid references auth.users(id) on delete set null;

-- "Any SpreadApps admin". Existing RLS policies use this name, so platform admins inherit them.
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('super_admin','platform_admin'));
$$;

-- Only the SpreadApps owner
create or replace function public.is_root_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

drop policy if exists settings_admin on public.platform_settings;
create policy settings_read on public.platform_settings for select to authenticated using (is_super_admin());
create policy settings_root on public.platform_settings for all to authenticated using (is_root_admin()) with check (is_root_admin());

-- Platform admins may not edit platform-level profiles; only root may
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all to authenticated
  using (is_root_admin() or (is_super_admin() and tenant_id is not null))
  with check (is_root_admin() or (is_super_admin() and tenant_id is not null and role in ('lab_owner','lab_staff')));

-- Lab admins see their whole team
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_super_admin() or (tenant_id is not null and tenant_id = my_tenant_id()));
