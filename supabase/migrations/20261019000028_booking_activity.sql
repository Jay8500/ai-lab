-- Booking status changes on the timeline
create or replace function public.test_bookings_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.handled_by := coalesce(auth.uid(), new.handled_by);
    perform public.log_activity(new.tenant_id, 'booking', new.id, new.status,
      'Booking ' || new.ref || ' ' || case new.status when 'confirmed' then 'confirmed' when 'cancelled' then 'cancelled'
        when 'completed' then 'registered as a visit' else new.status end || ' · ' || new.patient_name
        || coalesce(' · ' || new.status_note, ''));
  end if;
  return new;
end $$;
drop trigger if exists test_bookings_activity on public.test_bookings;
create trigger test_bookings_activity before update on public.test_bookings for each row execute function public.test_bookings_activity();
