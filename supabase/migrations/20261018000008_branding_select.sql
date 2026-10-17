-- Storage upserts/deletes also need SELECT on the object; let SpreadApps admins manage branding files
create policy branding_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'branding' and is_super_admin());
