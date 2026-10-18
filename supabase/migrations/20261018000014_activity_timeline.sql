-- Activity history for timelines (newest → oldest). Written only by triggers / log_event().
create table public.activity_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,   -- null = SpreadApps platform
  actor_id uuid references auth.users(id) on delete set null,
  entity text not null,          -- visit | task | user | ticket | session | lab | announcement
  entity_id uuid,
  action text not null,          -- registered, testing, verified, report_uploaded, report_sent, delivered, created, completed, ...
  summary text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_tenant_time on public.activity_log (tenant_id, created_at desc);
create index activity_actor_time on public.activity_log (actor_id, created_at desc);
create index activity_entity on public.activity_log (entity, entity_id, created_at desc);

alter table public.activity_log enable row level security;
-- SpreadApps admins: everything. Lab admin: whole lab. Staff: own actions + patient (visit) history.
create policy activity_read on public.activity_log for select to authenticated using (
  public.is_super_admin()
  or (tenant_id is not null and tenant_id = public.my_tenant_id()
      and (public.my_role() = 'lab_owner' or actor_id = auth.uid() or entity = 'visit'))
);

create or replace function public.log_activity(p_tenant uuid, p_entity text, p_entity_id uuid, p_action text, p_summary text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into activity_log (tenant_id, actor_id, entity, entity_id, action, summary, meta)
  values (p_tenant, auth.uid(), p_entity, p_entity_id, p_action, left(p_summary, 300), coalesce(p_meta, '{}'::jsonb));
$$;
revoke all on function public.log_activity(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;

-- App-side events (sign in / out) — only for the caller, only whitelisted actions
create or replace function public.log_event(p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_name text;
begin
  if auth.uid() is null or p_action not in ('signed_in', 'signed_out') then return; end if;
  select tenant_id, coalesce(full_name, username) into v_tenant, v_name from profiles where id = auth.uid();
  perform public.log_activity(v_tenant, 'session', auth.uid(), p_action,
    case p_action when 'signed_in' then coalesce(v_name, 'User') || ' signed in' else coalesce(v_name, 'User') || ' signed out' end);
end $$;
grant execute on function public.log_event(text) to authenticated;

-- ───── Visits ─────
create or replace function public.visits_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tests text;
begin
  select string_agg(t->>'code', ', ') into v_tests from jsonb_array_elements(new.tests) t;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.tenant_id, 'visit', new.id, 'registered',
      'Registered ' || new.patient_name || ' · ' || coalesce(v_tests, 'tests'), jsonb_build_object('token', new.token, 'mobile', new.mobile));
    return new;
  end if;
  if new.report_path is distinct from old.report_path and new.report_path is not null then
    perform public.log_activity(new.tenant_id, 'visit', new.id, 'report_uploaded',
      'Report uploaded for ' || new.patient_name, jsonb_build_object('token', new.token, 'file', new.report_name));
  elsif new.status is distinct from old.status then
    perform public.log_activity(new.tenant_id, 'visit', new.id, new.status,
      case new.status
        when 'in_lab' then 'Testing started for '
        when 'verified' then 'Results verified for '
        when 'ready' then 'Report ready for '
        when 'delivered' then 'Report delivered to '
        else 'Status updated for ' end || new.patient_name,
      jsonb_build_object('token', new.token));
  end if;
  if new.notified_at is distinct from old.notified_at and new.notified_at is not null and new.status is not distinct from old.status then
    perform public.log_activity(new.tenant_id, 'visit', new.id, 'report_sent', 'Report re-sent to ' || new.patient_name, jsonb_build_object('token', new.token));
  end if;
  return new;
end $$;
create trigger visits_activity after insert or update on public.visits for each row execute function public.visits_activity();

-- ───── Tasks ─────
create or replace function public.tasks_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_who text;
begin
  select coalesce(full_name, username) into v_who from profiles where id = new.assignee_id;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.tenant_id, 'task', new.id, 'created', 'Task “' || new.title || '” for ' || coalesce(v_who, 'someone'));
  elsif new.status = 'done' and old.status <> 'done' then
    perform public.log_activity(new.tenant_id, 'task', new.id, 'completed', 'Completed “' || new.title || '”');
  elsif new.assignee_id <> old.assignee_id then
    perform public.log_activity(new.tenant_id, 'task', new.id, 'reassigned', '“' || new.title || '” reassigned to ' || coalesce(v_who, 'someone'));
  end if;
  return new;
end $$;
create trigger tasks_activity after insert or update on public.tasks for each row execute function public.tasks_activity();

-- ───── Logins, tickets, labs, announcements ─────
-- A new login gets its username from the admin-users edge function right after creation
create or replace function public.profiles_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.tenant_id, 'user', new.id, 'created', 'Login created for ' || coalesce(new.full_name, new.username),
    jsonb_build_object('role', new.role, 'username', new.username));
  return new;
end $$;
create trigger profiles_activity after update of username on public.profiles for each row
  when (old.username is null and new.username is not null) execute function public.profiles_activity();

create or replace function public.tickets_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.tenant_id, 'ticket', new.id, case when new.kind = 'feedback' then 'feedback' else 'raised' end,
    case when new.kind = 'feedback' then 'Feedback sent' else 'Support ticket: ' || new.summary end);
  return new;
end $$;
create trigger tickets_activity after insert on public.support_tickets for each row execute function public.tickets_activity();

create or replace function public.tenants_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(null, 'lab', new.id, 'created', 'Lab created: ' || new.name);
  return new;
end $$;
create trigger tenants_activity after insert on public.tenants for each row execute function public.tenants_activity();

create or replace function public.announcements_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sent_at is not null and old.sent_at is null then
    perform public.log_activity(null, 'announcement', new.id, 'sent', 'Announcement sent: ' || new.subject,
      jsonb_build_object('emails', new.sent, 'in_app', new.in_app_count));
  end if;
  return new;
end $$;
create trigger announcements_activity after update on public.announcements for each row execute function public.announcements_activity();

-- ───── Patient portal: this visit's timeline + earlier visits (same mobile, same lab) ─────
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
                            'report_path', case when p.status in ('ready','delivered') then p.report_path end)
                          order by p.created_at desc)
                        from visits p, v
                        where p.tenant_id = v.tenant_id and v.mobile is not null and p.mobile = v.mobile and p.id <> v.id), '[]'::jsonb)
  ) from v;
$$;
grant execute on function public.track_history(text, text) to anon, authenticated;

-- Backfill: existing visits get a "registered" event so timelines aren't empty
insert into public.activity_log (tenant_id, actor_id, entity, entity_id, action, summary, meta, created_at)
select v.tenant_id, v.created_by, 'visit', v.id, 'registered', 'Registered ' || v.patient_name, jsonb_build_object('token', v.token), v.created_at
from public.visits v;
insert into public.activity_log (tenant_id, actor_id, entity, entity_id, action, summary, meta, created_at)
select v.tenant_id, v.created_by, 'visit', v.id, 'report_uploaded', 'Report uploaded for ' || v.patient_name, jsonb_build_object('token', v.token), v.report_uploaded_at
from public.visits v where v.report_uploaded_at is not null;
