-- Profile photos, unique usernames, and lab admins managing their own test catalogue.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- Username base for a user: <lab token prefix | sa>.<first name>, e.g. vij.ravi / sa.jay
create or replace function public.next_username(p_tenant uuid, p_name text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_prefix text;
  v_base text;
  v_try text;
  v_n int := 1;
begin
  if p_tenant is null then
    v_prefix := 'sa';
  else
    select lower(regexp_replace(token_prefix, '[^A-Za-z0-9]', '', 'g')) into v_prefix from tenants where id = p_tenant;
  end if;
  v_base := coalesce(nullif(v_prefix, ''), 'lab') || '.' ||
            coalesce(nullif(lower(regexp_replace(split_part(trim(coalesce(p_name, '')), ' ', 1), '[^A-Za-z0-9]', '', 'g')), ''), 'user');
  v_try := v_base;
  while exists (select 1 from profiles where lower(username) = v_try) loop
    v_n := v_n + 1;
    v_try := v_base || v_n;
  end loop;
  return v_try;
end $$;
revoke execute on function public.next_username(uuid, text) from anon, authenticated;

-- Backfill existing accounts
update public.profiles p set username = public.next_username(p.tenant_id, coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)))
where p.username is null;

-- Sign-in by username: resolves to the account email ONLY when the username belongs
-- to the site being signed into (a lab's slug, or the platform when p_slug is null).
-- Another lab's usernames simply don't exist from here.
create or replace function public.resolve_login(p_username text, p_slug text default null)
returns text language sql stable security definer set search_path = public as $$
  select p.email from profiles p
  left join tenants t on t.id = p.tenant_id
  where lower(p.username) = lower(trim(p_username))
    and (
      (p_slug is null and p.role in ('super_admin','platform_admin'))
      or (p_slug is not null and t.slug = lower(p_slug) and p.role in ('lab_owner','lab_staff'))
    )
  limit 1;
$$;
grant execute on function public.resolve_login(text, text) to anon, authenticated;

-- Self-service profile edits go through this function only (name + photo), so nobody can
-- change their own role, lab or username.
drop policy if exists profiles_self_update on public.profiles;
create or replace function public.update_my_profile(p_full_name text, p_avatar_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update profiles set full_name = nullif(trim(p_full_name), ''), avatar_url = nullif(trim(p_avatar_url), '')
  where id = auth.uid();
end $$;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- Lab admins maintain their own tests & prices
create or replace function public.update_test_catalog(p_tests jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from profiles where id = auth.uid() and role = 'lab_owner';
  if v_tenant is null then raise exception 'permission denied'; end if;
  if jsonb_typeof(p_tests) <> 'array' then raise exception 'invalid input'; end if;
  update tenants set test_catalog = p_tests where id = v_tenant;
end $$;
grant execute on function public.update_test_catalog(jsonb) to authenticated;

-- Profile photos: public bucket, each user writes only inside their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
