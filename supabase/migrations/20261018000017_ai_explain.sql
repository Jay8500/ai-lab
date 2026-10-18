-- AI report explanation: status per visit + per-lab AI key lookup for the server only.
alter table public.visits add column if not exists ai_status text not null default 'none'
  check (ai_status in ('none','pending','done','error'));
alter table public.visits add column if not exists ai_error text;
alter table public.visits add column if not exists ai_generated_at timestamptz;
alter table public.visits add column if not exists ai_model text;

-- Lab's AI provider / key / model from Vault — callable only by the explain-report edge function (service role)
create or replace function public.tenant_ai_config(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select jsonb_object_agg(split_part(name, '/', 3), decrypted_secret)
  from vault.decrypted_secrets
  where name in ('tenant/' || p_tenant || '/ai_provider', 'tenant/' || p_tenant || '/ai_api_key', 'tenant/' || p_tenant || '/ai_model');
$$;
revoke all on function public.tenant_ai_config(uuid) from public, anon, authenticated;
grant execute on function public.tenant_ai_config(uuid) to service_role;

-- Patient portal also needs to know whether the explanation is being written
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
    'ai_status', v.ai_status,
    'created_at', v.created_at,
    'mobile_hint', right(coalesce(v.mobile,''), 4)
  )
  from visits v join tenants t on t.id = v.tenant_id
  where t.slug = lower(p_slug) and upper(v.token) = upper(trim(p_token))
  limit 1;
$$;
