-- Invoice payments (UPI / bank transfer) with admin verification, and mandatory payment:
-- an invoice unpaid past due_date + grace days pauses the lab's new work until paid.

alter table public.billing_events drop constraint if exists billing_events_status_check;
alter table public.billing_events add constraint billing_events_status_check check (status in ('due','verifying','paid','waived'));
alter table public.billing_events add column if not exists payment_ref text;
alter table public.billing_events add column if not exists paid_via text check (paid_via is null or paid_via in ('upi','bank','cash','cheque','online'));
alter table public.billing_events add column if not exists payment_submitted_at timestamptz;
alter table public.billing_events add column if not exists payment_note text;
alter table public.billing_events add column if not exists reject_reason text;

insert into public.platform_settings (key, value) values
  ('billing', '{"upi_id":"","payee_name":"SpreadApps","bank_details":"","grace_days":7,"enforce":true}')
on conflict (key) do nothing;

-- Payment instructions for lab admins (no other platform settings exposed)
create or replace function public.billing_payee()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'upi_id', coalesce(value->>'upi_id', ''), 'payee_name', coalesce(value->>'payee_name', 'SpreadApps'),
    'bank_details', coalesce(value->>'bank_details', ''), 'grace_days', coalesce((value->>'grace_days')::int, 7))
  from platform_settings where key = 'billing'
    and (public.is_super_admin() or public.my_role() = 'lab_owner');
$$;
grant execute on function public.billing_payee() to authenticated;

-- Lab admin submits a payment reference → 'verifying' (SpreadApps confirms)
create or replace function public.submit_payment(p_bill uuid, p_ref text, p_method text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b billing_events;
begin
  select * into b from billing_events where id = p_bill;
  if b.id is null or b.tenant_id <> public.my_tenant_id() or public.my_role() <> 'lab_owner' then raise exception 'permission denied'; end if;
  if b.status <> 'due' then raise exception 'invalid input: this invoice is not awaiting payment'; end if;
  if trim(coalesce(p_ref, '')) !~ '^[A-Za-z0-9/-]{6,30}$' then raise exception 'invalid input: reference'; end if;
  if p_method not in ('upi','bank','cash','cheque') then raise exception 'invalid input: method'; end if;
  update billing_events set status = 'verifying', payment_ref = upper(trim(p_ref)), paid_via = p_method,
    payment_note = nullif(left(trim(coalesce(p_note, '')), 300), ''), payment_submitted_at = now(), reject_reason = null
  where id = p_bill;
  perform public.log_activity(b.tenant_id, 'billing', b.id, 'submitted',
    'Payment submitted ₹' || trim(to_char(b.amount, 'FM99,99,99,990.00')) || ' · ref ' || upper(trim(p_ref)));
end $$;
grant execute on function public.submit_payment(uuid, text, text, text) to authenticated;

-- Why a lab is paused (null = usable)
create or replace function public.tenant_block_reason(p_tenant uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare t tenants; s jsonb; v_grace int; v_enforce boolean;
begin
  select * into t from tenants where id = p_tenant;
  if t.id is null then return 'inactive'; end if;
  if t.status = 'suspended' or t.status = 'expired' then return 'inactive'; end if;
  if t.status = 'trial' and now() >= t.trial_started_at + make_interval(days => t.trial_days) then return 'trial_ended'; end if;
  if t.status = 'active' and t.subscription_ends_at is not null and t.subscription_ends_at <= now() then return 'inactive'; end if;
  select value into s from platform_settings where key = 'billing';
  v_grace := coalesce((s->>'grace_days')::int, 7);
  v_enforce := coalesce((s->>'enforce')::boolean, true);
  if v_enforce and exists (select 1 from billing_events b where b.tenant_id = p_tenant and b.status = 'due'
                           and b.due_date is not null and b.due_date + v_grace < current_date) then
    return 'payment_overdue';
  end if;
  return null;
end $$;

create or replace function public.tenant_is_usable(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tenant_block_reason(p_tenant) is null;
$$;

-- Public branding gains the block reason (no amounts are exposed)
create or replace function public.resolve_tenant(p_slug text default null, p_domain text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.name, 'tagline', t.tagline,
    'logo_url', t.logo_url, 'favicon_url', t.favicon_url, 'cover_url', t.cover_url,
    'brand_color', t.brand_color, 'accent_color', t.accent_color,
    'contact_phone', t.contact_phone, 'contact_email', t.contact_email,
    'whatsapp_number', t.whatsapp_number, 'address', t.address,
    'status', t.status, 'trial_ends_at', t.trial_started_at + make_interval(days => t.trial_days),
    'usable', public.tenant_is_usable(t.id),
    'block_reason', public.tenant_block_reason(t.id),
    'pages', t.pages, 'test_catalog', t.test_catalog
  )
  from tenants t
  where (p_slug is not null and t.slug = lower(p_slug))
     or (p_domain is not null and t.custom_domain = lower(p_domain))
  limit 1;
$$;
