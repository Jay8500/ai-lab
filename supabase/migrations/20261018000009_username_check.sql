-- Live username check for the "Create login" form (admins and lab admins only, so
-- the public can't probe which usernames exist).

create or replace function public.can_manage_logins(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or (p_tenant is not null and exists (
            select 1 from profiles where id = auth.uid() and role = 'lab_owner' and tenant_id = p_tenant));
$$;

-- { username, valid, available, suggestion }
--   p_username empty → suggestion is the auto-generated name for p_name
create or replace function public.check_username(p_tenant uuid, p_username text, p_name text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_u text := lower(trim(coalesce(p_username, '')));
  v_valid boolean;
  v_taken boolean;
begin
  if not public.can_manage_logins(p_tenant) then raise exception 'permission denied'; end if;

  if v_u = '' then
    return jsonb_build_object('username', null, 'valid', true, 'available', true,
                              'suggestion', public.next_username(p_tenant, p_name));
  end if;

  v_valid := v_u ~ '^[a-z0-9][a-z0-9._-]{2,30}$';
  v_taken := exists (select 1 from profiles where lower(username) = v_u);
  return jsonb_build_object(
    'username', v_u,
    'valid', v_valid,
    'available', v_valid and not v_taken,
    'suggestion', case when v_taken then public.next_username(p_tenant, coalesce(nullif(p_name, ''), split_part(v_u, '.', 2), v_u)) end
  );
end $$;

revoke all on function public.check_username(uuid, text, text), public.can_manage_logins(uuid) from public, anon;
grant execute on function public.check_username(uuid, text, text) to authenticated;
