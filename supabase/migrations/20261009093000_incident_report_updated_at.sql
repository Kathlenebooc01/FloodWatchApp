-- Track the time of every report edit, including admin status changes.
alter table public.incident_report
  add column if not exists updated_at timestamptz;

update public.incident_report
set updated_at = coalesce(reviewed_at, created_at)
where updated_at is null;

alter table public.incident_report
  alter column updated_at set default now();

create or replace function public.set_incident_report_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_incident_report_updated_at on public.incident_report;
create trigger set_incident_report_updated_at
before update on public.incident_report
for each row execute function public.set_incident_report_updated_at();
