-- Tasks / to-dos. tenant_id = a lab's shared task list; NULL = the SpreadApps team's own list.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 1000),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  category text check (category is null or char_length(category) <= 40),
  due_at timestamptz,
  has_time boolean not null default false,
  visit_token text check (visit_token is null or visit_token ~ '^[A-Z]{1,5}-[0-9]{4}-[0-9]{3,4}$'),
  assignee_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_scope_due on public.tasks (tenant_id, status, due_at);
create index tasks_assignee on public.tasks (assignee_id, status);
create trigger tasks_touch before update on public.tasks for each row execute function touch_updated_at();

-- Is the user part of this task list? (lab member, or SpreadApps admin for the platform list)
create or replace function public.in_task_scope(p_user uuid, p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = p_user and (
      (p_tenant is null and p.role in ('super_admin','platform_admin'))
      or (p_tenant is not null and p.tenant_id = p_tenant and p.role in ('lab_owner','lab_staff'))
    ));
$$;

-- Can the current user manage every task in this list? (lab admin / SpreadApps owner)
create or replace function public.is_task_manager(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_tenant is null then public.is_root_admin()
              else exists (select 1 from profiles where id = auth.uid() and role = 'lab_owner' and tenant_id = p_tenant) end;
$$;

-- Keep assignee inside the same list, stamp completion time
create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.in_task_scope(new.assignee_id, new.tenant_id) then
    raise exception 'invalid input: assignee is not part of this team';
  end if;
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'permission denied';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  new.title := trim(new.title);
  return new;
end $$;
create trigger tasks_guard before insert or update on public.tasks for each row execute function public.tasks_guard();

alter table public.tasks enable row level security;

create policy tasks_read on public.tasks for select to authenticated
  using (public.in_task_scope(auth.uid(), tenant_id));

create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.in_task_scope(auth.uid(), tenant_id) and created_by = auth.uid());

create policy tasks_update on public.tasks for update to authenticated
  using (public.in_task_scope(auth.uid(), tenant_id)
         and (created_by = auth.uid() or assignee_id = auth.uid() or public.is_task_manager(tenant_id)))
  with check (public.in_task_scope(auth.uid(), tenant_id));

create policy tasks_delete on public.tasks for delete to authenticated
  using (public.in_task_scope(auth.uid(), tenant_id) and (created_by = auth.uid() or public.is_task_manager(tenant_id)));

alter publication supabase_realtime add table public.tasks;
