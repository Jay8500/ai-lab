-- Super admins may attach screenshots while viewing any lab
drop policy if exists support_insert on storage.objects;
create policy support_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support' and (is_super_admin() or (storage.foldername(name))[1] = coalesce(my_tenant_id()::text, 'platform')));
