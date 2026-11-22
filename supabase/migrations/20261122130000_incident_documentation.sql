-- One durable documentation record per incident, shared by mobile and web clients.
create table if not exists public.incident_documentation (
  incident_id uuid primary key references public.incident_report(report_id) on delete cascade,
  municipality_id uuid not null references public.municipality_or_city(municipality_id),
  status text not null default 'In Progress' check (status in ('In Progress', 'Completed')),
  situation text not null default '',
  location text not null default '',
  incident_date_time text not null default '',
  actions_taken text not null default '',
  response_outcome text not null default '',
  supporting_info text not null default '',
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_by uuid not null references public.profiles(id),
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists incident_documentation_municipality_idx
  on public.incident_documentation(municipality_id, updated_at desc);

create or replace function public.check_incident_documentation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  incident public.incident_report%rowtype;
begin
  select * into incident from public.incident_report where report_id = new.incident_id;
  if incident.report_id is null or incident.municipality_id is distinct from new.municipality_id
     or incident.status <> 'Done'
     or incident.report_type not in ('quick_snap', 'moderate_report', 'general_inquiries') then
    raise exception 'Documentation requires a completed incident in the assigned municipality.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'Completed' then
      raise exception 'Completed documentation is read only.' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  if new.status = 'Completed' then
    if nullif(trim(new.actions_taken), '') is null or nullif(trim(new.response_outcome), '') is null then
      raise exception 'Actions taken and response outcome are required.' using errcode = '23514';
    end if;
    new.completed_by := auth.uid();
    new.completed_at := now();
  else
    new.completed_by := null;
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists check_incident_documentation on public.incident_documentation;
create trigger check_incident_documentation before insert or update on public.incident_documentation
for each row execute function public.check_incident_documentation();

alter table public.incident_documentation enable row level security;
grant select, insert, update on public.incident_documentation to authenticated;
create policy "Assigned LGU and admins read incident documentation"
on public.incident_documentation for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active'
    and (p.role in ('provincial_admin', 'national_admin') or
      (p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster') and p.municipality_id = incident_documentation.municipality_id)))
);
create policy "Assigned LGU creates incident documentation"
on public.incident_documentation for insert to authenticated with check (
  created_by = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.account_status = 'active' and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and p.municipality_id = incident_documentation.municipality_id)
);
create policy "Assigned LGU edits draft incident documentation"
on public.incident_documentation for update to authenticated using (
  status = 'In Progress' and exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.account_status = 'active' and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and p.municipality_id = incident_documentation.municipality_id)
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid()
    and p.account_status = 'active' and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and p.municipality_id = incident_documentation.municipality_id)
);

insert into storage.buckets(id, name, public) values ('incident-documentation', 'incident-documentation', false)
on conflict (id) do nothing;

create policy "Incident staff read documentation files" on storage.objects for select to authenticated
using (bucket_id = 'incident-documentation' and exists (
  select 1 from public.incident_documentation d join public.profiles p on p.id = auth.uid()
  where d.incident_id::text = (storage.foldername(name))[1] and p.account_status = 'active'
    and (p.role in ('provincial_admin', 'national_admin') or
      (p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster') and p.municipality_id = d.municipality_id))
));
create policy "Assigned LGU uploads documentation files" on storage.objects for insert to authenticated
with check (bucket_id = 'incident-documentation' and exists (
  select 1 from public.incident_report i join public.profiles p on p.id = auth.uid()
  where i.report_id::text = (storage.foldername(name))[1] and i.status = 'Done'
    and p.account_status = 'active' and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and p.municipality_id = i.municipality_id
    and not exists (select 1 from public.incident_documentation d where d.incident_id = i.report_id and d.status = 'Completed')
));
