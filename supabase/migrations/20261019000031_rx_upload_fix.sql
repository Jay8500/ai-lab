-- Anonymous visitors can't read tenants, so check the folder with a yes/no helper instead.
create or replace function public.is_tenant_folder(p_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenants t where t.id::text = p_folder and public.tenant_is_usable(t.id));
$$;
grant execute on function public.is_tenant_folder(text) to anon, authenticated;

drop policy if exists rx_upload on storage.objects;
create policy rx_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'prescriptions'
              and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'
              and public.is_tenant_folder((storage.foldername(name))[1]));
