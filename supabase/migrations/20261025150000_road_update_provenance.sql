-- Record the organization or official notice that actually supplied a road condition.
-- created_by identifies the FloodWatch operator who entered the report.
alter table public.road_passability_updates
  add column if not exists source_name text,
  add column if not exists source_reference text;

alter table public.road_passability_updates
  drop constraint if exists road_passability_updates_source_name_check;

alter table public.road_passability_updates
  add constraint road_passability_updates_source_name_check
  check (source_name is not null and length(trim(source_name)) between 3 and 160);

-- Provincial and national administrators may publish verified reports for any
-- supported Cebu municipality. Assigned LGU insert access remains unchanged.
drop policy if exists "Backend admins post verified road updates"
  on public.road_passability_updates;
create policy "Backend admins post verified road updates"
  on public.road_passability_updates for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('provincial_admin', 'national_admin')
    )
    and exists (
      select 1 from public.municipality_or_city m
      where m.municipality_id = road_passability_updates.municipality_id
    )
  );
