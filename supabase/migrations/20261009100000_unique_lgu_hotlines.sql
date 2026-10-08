-- A repeated tap or request cannot create the same hotline twice for one municipality.
create unique index if not exists municipality_lgu_hotlines_unique_entry
on public.municipality_lgu_hotlines (
  municipality_id,
  lower(btrim(department_name)),
  regexp_replace(hotline_number, '[^0-9+]', '', 'g')
);

alter table public.municipality_lgu_hotlines enable row level security;

drop policy if exists "LGU can add own municipality hotlines" on public.municipality_lgu_hotlines;
create policy "LGU can add own municipality hotlines"
on public.municipality_lgu_hotlines for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and p.municipality_id = municipality_lgu_hotlines.municipality_id
));

drop policy if exists "LGU and provincial admins can read hotlines" on public.municipality_lgu_hotlines;
create policy "LGU and provincial admins can read hotlines"
on public.municipality_lgu_hotlines for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and (p.role in ('national_admin', 'provincial_admin')
         or (p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
             and p.municipality_id = municipality_lgu_hotlines.municipality_id))
));

drop policy if exists "LGU and provincial admins can edit hotlines" on public.municipality_lgu_hotlines;
create policy "LGU and provincial admins can edit hotlines"
on public.municipality_lgu_hotlines for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and (p.role in ('national_admin', 'provincial_admin')
         or (p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
             and p.municipality_id = municipality_lgu_hotlines.municipality_id))
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and (p.role in ('national_admin', 'provincial_admin')
         or (p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
             and p.municipality_id = municipality_lgu_hotlines.municipality_id))
));

drop policy if exists "LGU and provincial admins can delete hotlines" on public.municipality_lgu_hotlines;
create policy "LGU and provincial admins can delete hotlines"
on public.municipality_lgu_hotlines for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and (p.role in ('national_admin', 'provincial_admin')
         or (p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
             and p.municipality_id = municipality_lgu_hotlines.municipality_id))
));
