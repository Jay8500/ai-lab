-- Labs may delete prescriptions they hold; successful track checks are not stored (only failures count).
drop policy if exists rx_delete on storage.objects;
create policy rx_delete on storage.objects for delete to authenticated
  using (bucket_id = 'prescriptions' and ((storage.foldername(name))[1] = my_tenant_id()::text or is_super_admin()));

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
    return 'ok';
  end if;
  insert into track_attempts (tenant_id, token, ok) values (v.tenant_id, v.token, false);
  return case when v_fails + 1 >= 5 then 'blocked' else 'wrong' end;
end $$;
revoke all on function public.track_access(visits, text, text) from public, anon, authenticated;
delete from public.track_attempts where ok;
