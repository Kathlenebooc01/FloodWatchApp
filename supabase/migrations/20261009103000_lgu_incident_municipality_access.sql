-- LGU report access follows the municipality assigned to the authenticated profile.
-- Existing policies for citizens and provincial staff remain in effect.
alter table public.incident_report enable row level security;

drop policy if exists "LGU reads assigned municipality incident reports" on public.incident_report;
create policy "LGU reads assigned municipality incident reports"
on public.incident_report as permissive for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and p.municipality_id is not null
    and p.municipality_id = incident_report.municipality_id
));

drop policy if exists "LGU cannot read other municipalities incident reports" on public.incident_report;
create policy "LGU cannot read other municipalities incident reports"
on public.incident_report as restrictive for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and (p.role not in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
         or (p.municipality_id is not null
             and p.municipality_id = incident_report.municipality_id))
));

-- Deliver assignment changes while an LGU user has the Reports page open.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
     ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incident_report'
     ) then
    alter publication supabase_realtime add table public.incident_report;
  end if;
end;
$$;
