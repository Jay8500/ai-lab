-- Earlier visits use the same limited check as track_visit (wrong digits count towards the 5-try limit).
create or replace function public.track_history(p_slug text, p_token text, p_key text default null, p_last4 text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v visits; v_access text;
begin
  select vv.* into v from visits vv join tenants t on t.id = vv.tenant_id
   where t.slug = lower(p_slug) and upper(vv.token) = upper(trim(p_token)) limit 1;
  if v.id is null then return null; end if;
  v_access := public.track_access(v, p_key, p_last4);
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at) order by a.created_at desc)
                        from activity_log a where a.entity = 'visit' and a.entity_id = v.id
                          and (v_access = 'ok' or a.action in ('registered','in_lab','verified','ready','delivered'))), '[]'::jsonb),
    'previous', case when v_access <> 'ok' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
                    'token', p.token, 'created_at', p.created_at, 'status', p.status,
                    'tests', (select coalesce(jsonb_agg(jsonb_build_object('code', t->>'code', 'name', t->>'name')), '[]'::jsonb) from jsonb_array_elements(p.tests) t),
                    'report_path', case when p.status in ('ready','delivered') then p.report_path end,
                    'ai_values', case when p.ai_status = 'done' and p.status in ('ready','delivered') then p.ai_values end)
                  order by p.created_at desc)
                from visits p where p.tenant_id = v.tenant_id and v.mobile is not null and p.mobile = v.mobile and p.id <> v.id), '[]'::jsonb) end
  );
end $$;
grant execute on function public.track_history(text, text, text, text) to anon, authenticated;
