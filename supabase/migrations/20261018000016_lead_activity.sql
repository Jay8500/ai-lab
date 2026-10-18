-- Label demo requests properly in the activity timeline
create or replace function public.tickets_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.tenant_id, 'ticket', new.id,
    case new.kind when 'feedback' then 'feedback' when 'lead' then 'lead' else 'raised' end,
    case new.kind when 'feedback' then 'Feedback sent' when 'lead' then new.summary else 'Support ticket: ' || new.summary end);
  return new;
end $$;
