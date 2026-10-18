-- Billing: more charge types (database/hosting, maintenance, other), due dates, notice tracking.
alter table public.billing_events drop constraint if exists billing_events_kind_check;
alter table public.billing_events add constraint billing_events_kind_check
  check (kind in ('subscription','per_report','revenue_share','setup','database','maintenance','adjustment','other'));
alter table public.billing_events add column if not exists due_date date;
alter table public.billing_events add column if not exists notified_at timestamptz;

-- Lab admins see their invoices in the activity timeline too
create or replace function public.billing_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.tenant_id, 'billing', new.id, 'invoice',
      'Invoice ₹' || trim(to_char(new.amount, 'FM99,99,99,990.00')) || ' · ' || replace(new.kind, '_', ' ') || coalesce(' · ' || new.period, ''));
  elsif new.status = 'paid' and old.status <> 'paid' then
    perform public.log_activity(new.tenant_id, 'billing', new.id, 'paid',
      'Payment received ₹' || trim(to_char(new.amount, 'FM99,99,99,990.00')) || ' · ' || replace(new.kind, '_', ' '));
  end if;
  return new;
end $$;
drop trigger if exists billing_activity on public.billing_events;
create trigger billing_activity after insert or update on public.billing_events for each row execute function public.billing_activity();

-- Lab admins can read billing activity of their own lab
drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select to authenticated using (
  public.is_super_admin()
  or (tenant_id is not null and tenant_id = public.my_tenant_id()
      and (public.my_role() = 'lab_owner' or actor_id = auth.uid() or entity = 'visit'))
);
