-- Demo requests: remember when the owner was emailed about each one
alter table public.support_tickets add column if not exists alerted_at timestamptz;
