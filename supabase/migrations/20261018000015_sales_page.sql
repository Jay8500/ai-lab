-- Sales page (ailab.spreadapps.in): live public pricing + "Book a demo" requests.

-- Active plans, safe fields only, for anonymous visitors
create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code, 'name', name, 'billing_model', billing_model, 'price', price,
    'per_report_fee', per_report_fee, 'report_quota', report_quota, 'setup_fee', setup_fee, 'features', features
  ) order by price, per_report_fee), '[]'::jsonb)
  from plans where is_active;
$$;
grant execute on function public.public_plans() to anon, authenticated;

-- Demo requests land in the support inbox as kind = 'lead'
alter table public.support_tickets drop constraint if exists support_tickets_kind_check;
alter table public.support_tickets add constraint support_tickets_kind_check check (kind in ('ticket','feedback','lead'));

create or replace function public.submit_lead(p_name text, p_lab text, p_phone text, p_city text default null, p_email text default null, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'invalid input: name'; end if;
  if char_length(trim(coalesce(p_lab, ''))) not between 2 and 120 then raise exception 'invalid input: lab'; end if;
  if v_phone !~ '^(\+?91)?[6-9][0-9]{9}$' then raise exception 'invalid input: phone'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid input: email'; end if;
  -- simple flood guard: same phone at most 3 requests a day
  if (select count(*) from support_tickets where kind = 'lead' and details like '%' || v_phone || '%' and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate limit';
  end if;
  insert into support_tickets (kind, tenant_id, summary, details, priority, reporter_email, page_url)
  values ('lead', null,
          'Demo request: ' || left(trim(p_lab), 100),
          'Name: ' || trim(p_name) || E'\nLab: ' || trim(p_lab) || E'\nPhone: ' || v_phone
            || coalesce(E'\nCity: ' || nullif(trim(p_city), ''), '')
            || coalesce(E'\nEmail: ' || nullif(trim(p_email), ''), '')
            || coalesce(E'\n\n' || left(nullif(trim(p_message), ''), 1000), ''),
          'high', nullif(trim(p_email), ''), 'https://ailab.spreadapps.in')
  returning id into v_id;
  return upper(left(v_id::text, 8));
end $$;
grant execute on function public.submit_lead(text, text, text, text, text, text) to anon, authenticated;
