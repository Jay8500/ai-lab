-- Billing timeline: payment verified (with reference) and payment not matched (back to due).
create or replace function public.billing_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.tenant_id, 'billing', new.id, 'invoice',
      'Invoice ₹' || trim(to_char(new.amount, 'FM99,99,99,990.00')) || ' · ' || replace(new.kind, '_', ' ') || coalesce(' · ' || new.period, ''));
  elsif new.status = 'paid' and old.status <> 'paid' then
    perform public.log_activity(new.tenant_id, 'billing', new.id, 'paid',
      'Payment received ₹' || trim(to_char(new.amount, 'FM99,99,99,990.00')) || ' · ' || replace(new.kind, '_', ' ')
      || coalesce(' · ' || new.paid_via, '') || coalesce(' · ref ' || new.payment_ref, ''));
  elsif new.status = 'due' and old.status = 'verifying' then
    perform public.log_activity(new.tenant_id, 'billing', new.id, 'rejected',
      'Payment not confirmed ₹' || trim(to_char(new.amount, 'FM99,99,99,990.00')) || coalesce(' · ' || new.reject_reason, ''));
  end if;
  return new;
end $$;
