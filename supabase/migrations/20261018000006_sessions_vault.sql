-- Account security: device sessions + encrypted API keys.

-- ───────────── Sessions ─────────────
-- Last-seen per session (auth.sessions only updates when the token refreshes, ~hourly)
create table if not exists public.session_activity (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.session_activity enable row level security;
-- no policies: only reachable through the functions below

create or replace function public.current_session_id() returns uuid
language sql stable as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;

-- All devices signed in to my account
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active timestamptz, user_agent text, ip text, is_current boolean)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.created_at,
         greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz, a.last_seen) as last_active,
         s.user_agent, host(s.ip), s.id = public.current_session_id()
  from auth.sessions s
  left join public.session_activity a on a.session_id = s.id
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  order by (s.id = public.current_session_id()) desc, last_active desc;
$$;

-- Heartbeat: is my session still valid? Also records last activity.
create or replace function public.session_ping() returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare v_sid uuid := public.current_session_id();
begin
  if auth.uid() is null or v_sid is null then return false; end if;
  if not exists (select 1 from auth.sessions where id = v_sid and user_id = auth.uid()) then return false; end if;
  insert into public.session_activity (session_id, user_id, last_seen) values (v_sid, auth.uid(), now())
  on conflict (session_id) do update set last_seen = excluded.last_seen;
  return true;
end $$;

create or replace function public.revoke_my_session(p_session uuid) returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where id = p_session and user_id = auth.uid();
  delete from public.session_activity where session_id = p_session and user_id = auth.uid();
$$;

create or replace function public.revoke_other_sessions() returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  delete from auth.sessions where user_id = auth.uid() and id <> public.current_session_id();
  get diagnostics n = row_count;
  delete from public.session_activity where user_id = auth.uid() and session_id <> public.current_session_id();
  return n;
end $$;

-- Admin "sign out everywhere" for a user — called only by the admin-users edge function
create or replace function public.admin_revoke_user_sessions(p_user uuid) returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  delete from public.session_activity where user_id = p_user;
  return n;
end $$;

revoke all on function public.my_sessions(), public.session_ping(), public.revoke_my_session(uuid),
  public.revoke_other_sessions(), public.admin_revoke_user_sessions(uuid) from public, anon;
grant execute on function public.my_sessions(), public.session_ping(), public.revoke_my_session(uuid),
  public.revoke_other_sessions() to authenticated;
revoke execute on function public.admin_revoke_user_sessions(uuid) from authenticated;

-- ───────────── Encrypted API keys (Supabase Vault) ─────────────
-- Each key is stored encrypted in vault.secrets as  tenant/<tenant id>/<field>.
-- Only SpreadApps admins can read/write them, and only through these functions.
create or replace function public.get_tenant_secrets(p_tenant uuid) returns jsonb
language plpgsql security definer set search_path = public, vault as $$
declare v jsonb := '{}'::jsonb; r record;
begin
  if not public.is_super_admin() then raise exception 'permission denied'; end if;
  for r in select name, decrypted_secret from vault.decrypted_secrets where name like 'tenant/' || p_tenant || '/%' loop
    v := v || jsonb_build_object(split_part(r.name, '/', 3), r.decrypted_secret);
  end loop;
  return v || jsonb_build_object('tenant_id', p_tenant);
end $$;

create or replace function public.set_tenant_secrets(p_tenant uuid, p_values jsonb) returns void
language plpgsql security definer set search_path = public, vault as $$
declare k text; val text; v_name text; v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'permission denied'; end if;
  if not exists (select 1 from tenants where id = p_tenant) then raise exception 'invalid input'; end if;
  for k, val in select key, value #>> '{}' from jsonb_each(p_values) loop
    continue when k = 'tenant_id' or k !~ '^[a-z_]{2,40}$';
    v_name := 'tenant/' || p_tenant || '/' || k;
    select id into v_id from vault.secrets where name = v_name;
    if coalesce(val, '') = '' then
      if v_id is not null then delete from vault.secrets where id = v_id; end if;
    elsif v_id is null then
      perform vault.create_secret(val, v_name, 'AI-Lab tenant API key');
    else
      perform vault.update_secret(v_id, val);
    end if;
  end loop;
  update tenant_secrets set updated_at = now() where tenant_id = p_tenant;
end $$;

revoke all on function public.get_tenant_secrets(uuid), public.set_tenant_secrets(uuid, jsonb) from public, anon;
grant execute on function public.get_tenant_secrets(uuid), public.set_tenant_secrets(uuid, jsonb) to authenticated;

-- Move any existing plaintext keys into Vault, then drop the plaintext columns
do $$
declare r record; k text; val text;
begin
  for r in select * from public.tenant_secrets loop
    foreach k in array array['whatsapp_provider','whatsapp_api_key','whatsapp_phone_id','sms_provider','sms_api_key','sms_sender_id',
                             'razorpay_key_id','razorpay_key_secret','ai_provider','ai_api_key','circles_project_id','circles_api_key'] loop
      val := to_jsonb(r) ->> k;
      if coalesce(val, '') <> '' then
        perform vault.create_secret(val, 'tenant/' || r.tenant_id || '/' || k, 'AI-Lab tenant API key');
      end if;
    end loop;
  end loop;
end $$;

alter table public.tenant_secrets
  drop column if exists whatsapp_provider, drop column if exists whatsapp_api_key, drop column if exists whatsapp_phone_id,
  drop column if exists sms_provider, drop column if exists sms_api_key, drop column if exists sms_sender_id,
  drop column if exists razorpay_key_id, drop column if exists razorpay_key_secret,
  drop column if exists ai_provider, drop column if exists ai_api_key,
  drop column if exists circles_project_id, drop column if exists circles_api_key, drop column if exists extra;

-- Deleting a lab also deletes its encrypted keys
create or replace function public.tenants_purge_secrets() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  delete from vault.secrets where name like 'tenant/' || old.id || '/%';
  return old;
end $$;
drop trigger if exists tenants_purge_secrets on public.tenants;
create trigger tenants_purge_secrets after delete on public.tenants for each row execute function public.tenants_purge_secrets();
