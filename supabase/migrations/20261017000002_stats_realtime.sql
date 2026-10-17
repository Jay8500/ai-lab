-- Per-tenant usage stats for the super admin revenue dashboard
create or replace function public.admin_tenant_stats()
returns table (
  tenant_id uuid,
  visits_total bigint,
  visits_month bigint,
  reports_month bigint,
  visits_today bigint,
  users bigint,
  open_tickets bigint,
  paid_total numeric,
  due_total numeric
) language sql stable security definer set search_path = public as $$
  select t.id,
    (select count(*) from visits v where v.tenant_id = t.id),
    (select count(*) from visits v where v.tenant_id = t.id and v.created_at >= date_trunc('month', now())),
    (select count(*) from visits v where v.tenant_id = t.id and v.report_uploaded_at >= date_trunc('month', now())),
    (select count(*) from visits v where v.tenant_id = t.id and v.created_at >= date_trunc('day', now())),
    (select count(*) from profiles p where p.tenant_id = t.id),
    (select count(*) from support_tickets s where s.tenant_id = t.id and s.status in ('open','synced','in_progress')),
    coalesce((select sum(amount) from billing_events b where b.tenant_id = t.id and b.status = 'paid'), 0),
    coalesce((select sum(amount) from billing_events b where b.tenant_id = t.id and b.status = 'due'), 0)
  from tenants t
  where public.is_super_admin();
$$;
grant execute on function public.admin_tenant_stats() to authenticated;

-- Live updates on the reception dashboard
alter publication supabase_realtime add table public.visits;
