-- Feedback (rating + idea/problem/praise) shares the support inbox with tickets.
alter table public.support_tickets add column if not exists kind text not null default 'ticket'
  check (kind in ('ticket','feedback'));
alter table public.support_tickets add column if not exists rating int check (rating is null or rating between 1 and 5);
