-- AI trends: numeric results the AI read from each report, for charts across a patient's visits.
-- ai_values = [{ "test": "Haemoglobin", "value": 13.2, "unit": "g/dL", "low": 13, "high": 17, "flag": "normal|low|high" }]
alter table public.visits add column if not exists ai_values jsonb;

create or replace function public.track_visit(p_slug text, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'token', v.token,
    'patient_name', v.patient_name,
    'age', v.age, 'gender', v.gender,
    'tests', v.tests, 'status', v.status,
    'report_path', case when v.status in ('ready','delivered') then v.report_path end,
    'report_name', v.report_name,
    'report_uploaded_at', v.report_uploaded_at,
    'ai_summary', case when v.ai_status = 'done' then v.ai_summary end,
    'ai_values', case when v.ai_status = 'done' and v.status in ('ready','delivered') then v.ai_values end,
    'ai_status', v.ai_status,
    'created_at', v.created_at,
    'mobile_hint', right(coalesce(v.mobile,''), 4)
  )
  from visits v join tenants t on t.id = v.tenant_id
  where t.slug = lower(p_slug) and upper(v.token) = upper(trim(p_token))
  limit 1;
$$;

create or replace function public.track_history(p_slug text, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  with v as (
    select v.* from visits v join tenants t on t.id = v.tenant_id
    where t.slug = lower(p_slug) and upper(v.token) = upper(trim(p_token)) limit 1
  )
  select jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'at', a.created_at) order by a.created_at desc)
                        from activity_log a, v where a.entity = 'visit' and a.entity_id = v.id), '[]'::jsonb),
    'previous', coalesce((select jsonb_agg(jsonb_build_object(
                            'token', p.token, 'created_at', p.created_at, 'status', p.status, 'tests', p.tests,
                            'report_path', case when p.status in ('ready','delivered') then p.report_path end,
                            'ai_values', case when p.ai_status = 'done' and p.status in ('ready','delivered') then p.ai_values end)
                          order by p.created_at desc)
                        from visits p, v
                        where p.tenant_id = v.tenant_id and v.mobile is not null and p.mobile = v.mobile and p.id <> v.id), '[]'::jsonb)
  ) from v;
$$;
