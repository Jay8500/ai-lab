-- In-app delivery of announcements: one row per recipient (works even without an email).
alter table public.announcements add column if not exists channels text[] not null default '{email,in_app}';
alter table public.announcements add column if not exists in_app_count int not null default 0;

create table public.announcement_recipients (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index announcement_recipients_user on public.announcement_recipients (user_id, created_at desc);

alter table public.announcement_recipients enable row level security;
create policy ann_rcpt_own_read on public.announcement_recipients for select to authenticated using (user_id = auth.uid() or is_super_admin());
create policy ann_rcpt_own_update on public.announcement_recipients for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Recipients may read the announcements addressed to them
create policy announcements_recipient_read on public.announcements for select to authenticated
  using (exists (select 1 from public.announcement_recipients r where r.announcement_id = id and r.user_id = auth.uid()));

-- Only read/dismiss timestamps may change from the app
create or replace function public.ann_rcpt_guard() returns trigger language plpgsql as $$
begin
  if new.announcement_id <> old.announcement_id or new.user_id <> old.user_id or new.tenant_id is distinct from old.tenant_id then
    raise exception 'permission denied';
  end if;
  return new;
end $$;
create trigger ann_rcpt_guard before update on public.announcement_recipients for each row execute function public.ann_rcpt_guard();

alter publication supabase_realtime add table public.announcement_recipients;
