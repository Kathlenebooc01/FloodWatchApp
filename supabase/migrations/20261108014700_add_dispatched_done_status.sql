-- Add 'Dispatched' and 'Done' to the incident_report status check constraint
-- so LGU can mark reports as dispatched and then done after acceptance.
do $$
declare
  existing_check text;
begin
  select pg_get_expr(c.conbin, c.conrelid)
    into existing_check
  from pg_constraint c
  where c.conrelid = 'public.incident_report'::regclass
    and c.conname = 'incident_report_status_check'
    and c.contype = 'c';

  if existing_check is null then
    raise exception 'incident_report_status_check was not found';
  end if;

  alter table public.incident_report drop constraint incident_report_status_check;
  execute format(
    'alter table public.incident_report add constraint incident_report_status_check check ((%s) or status = %L or status = %L)',
    existing_check,
    'Dispatched',
    'Done'
  );
end;
$$;
