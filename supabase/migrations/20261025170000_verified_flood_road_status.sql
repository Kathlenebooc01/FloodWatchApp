-- Existing road observations remain history. Only approved, current, non-test
-- flood observations contribute to public municipality road status.
alter table public.road_passability_updates
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz;

alter table public.road_passability_updates
  drop constraint if exists road_passability_updates_verification_check;
alter table public.road_passability_updates
  add constraint road_passability_updates_verification_check check (
    verification_status in ('pending', 'verified', 'rejected')
    and ((verification_status = 'verified' and verified_by is not null and verified_at is not null)
      or (verification_status <> 'verified' and verified_by is null and verified_at is null))
    and (verification_status <> 'verified' or nullif(trim(flood_condition), '') is not null)
    and (verification_status <> 'verified' or status not in
      ('partially_passable', 'caution', 'impassable', 'closed', 'flooded', 'under_monitoring')
      or (nullif(trim(details), '') is not null and nullif(trim(vehicle_access), '') is not null))
  );

create index if not exists road_passability_verified_recent_idx
  on public.road_passability_updates (municipality_id, observed_at desc)
  where verification_status = 'verified';

drop policy if exists "Signed-in users read road updates" on public.road_passability_updates;
create policy "Signed-in users read road updates"
  on public.road_passability_updates for select to authenticated
  using (
    coalesce(source_name, '') not ilike '%TEST DATA - FloodWatch Cebu%'
    and coalesce(details, '') not ilike '%TEST DATA ONLY%'
    and road_name not ilike 'TEST ROAD - %'
    and (
      verification_status = 'verified'
      or exists (
        select 1 from public.profiles p where p.id = auth.uid()
          and (
            p.role in ('provincial_admin', 'national_admin')
            or (p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
                and p.municipality_id = road_passability_updates.municipality_id)
          )
      )
    )
  );

drop policy if exists "Assigned LGU posts road updates" on public.road_passability_updates;
create policy "Assigned LGU posts road updates"
  on public.road_passability_updates for insert to authenticated
  with check (
    created_by = auth.uid() and verification_status = 'pending'
    and verified_by is null and verified_at is null
    and observed_at <= now() + interval '1 minute'
    and nullif(trim(flood_condition), '') is not null
    and coalesce(source_name, '') not ilike '%TEST DATA - FloodWatch Cebu%'
    and coalesce(details, '') not ilike '%TEST DATA ONLY%'
    and road_name not ilike 'TEST ROAD - %'
    and exists (select 1 from public.profiles p where p.id = auth.uid()
      and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
      and p.municipality_id = road_passability_updates.municipality_id)
  );

drop policy if exists "Backend admins post verified road updates" on public.road_passability_updates;
create policy "Backend admins post verified road updates"
  on public.road_passability_updates for insert to authenticated
  with check (
    created_by = auth.uid() and verification_status = 'pending'
    and verified_by is null and verified_at is null
    and observed_at <= now() + interval '1 minute'
    and nullif(trim(flood_condition), '') is not null
    and coalesce(source_name, '') not ilike '%TEST DATA - FloodWatch Cebu%'
    and coalesce(details, '') not ilike '%TEST DATA ONLY%'
    and road_name not ilike 'TEST ROAD - %'
    and exists (select 1 from public.profiles p where p.id = auth.uid()
      and p.role in ('provincial_admin', 'national_admin'))
  );

-- Verification changes only approval metadata; observations remain append-only.
create or replace function public.review_flood_road_observation(p_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.road_passability_updates%rowtype;
  v_reviewer uuid := auth.uid();
begin
  if v_reviewer is null or p_decision not in ('verified', 'rejected') then
    raise exception 'Invalid review request';
  end if;
  select * into v_row from public.road_passability_updates where id = p_id for update;
  if not found then raise exception 'Road observation not found'; end if;
  if v_row.verification_status <> 'pending' then raise exception 'Observation was already reviewed'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_reviewer
      and (p.role in ('provincial_admin', 'national_admin')
        or (p.role = 'lgu_headmaster' and p.municipality_id = v_row.municipality_id))
  ) then raise exception 'Not authorized to review this municipality'; end if;
  if p_decision = 'verified' and (
    v_row.expires_at <= now() or v_row.observed_at > now() + interval '1 minute'
    or nullif(trim(v_row.flood_condition), '') is null
    or coalesce(v_row.source_name, '') ilike '%TEST DATA - FloodWatch Cebu%'
    or coalesce(v_row.details, '') ilike '%TEST DATA ONLY%'
    or v_row.road_name ilike 'TEST ROAD - %'
  ) then raise exception 'Only current, genuine flood observations can be verified'; end if;
  update public.road_passability_updates set
    verification_status = p_decision,
    verified_by = case when p_decision = 'verified' then v_reviewer else null end,
    verified_at = case when p_decision = 'verified' then now() else null end
  where id = p_id;
end;
$$;
revoke all on function public.review_flood_road_observation(uuid, text) from public, anon;
grant execute on function public.review_flood_road_observation(uuid, text) to authenticated;

create or replace view public.municipality_flood_road_status
with (security_invoker = true) as
with latest_reports as (
  select distinct on (r.municipality_id, lower(trim(r.road_name)), lower(trim(coalesce(r.barangay, ''))))
    r.municipality_id, r.road_name, r.barangay, r.status, r.flood_condition,
    r.vehicle_access, r.details, r.source_name, r.source_reference, r.observed_at, r.expires_at,
    case
      when r.status in ('impassable', 'closed') then 'Impassable'
      when r.status in ('partially_passable', 'caution') then 'Partially Passable'
      when r.status in ('passable', 'reopened') then 'Passable'
      else 'Unknown'
    end as passability
  from public.road_passability_updates r
  where r.verification_status = 'verified'
    and r.observed_at <= now()
    and nullif(trim(r.flood_condition), '') is not null
    and coalesce(r.source_name, '') not ilike '%TEST DATA - FloodWatch Cebu%'
    and coalesce(r.details, '') not ilike '%TEST DATA ONLY%'
    and r.road_name not ilike 'TEST ROAD - %'
  order by r.municipality_id, lower(trim(r.road_name)),
    lower(trim(coalesce(r.barangay, ''))), r.observed_at desc, r.created_at desc, r.id desc
), current_reports as (
  select * from latest_reports where expires_at > now()
), summary as (
  select municipality_id, count(*) as roads_reported,
    count(*) filter (where passability = 'Impassable') as impassable_roads,
    count(*) filter (where passability = 'Partially Passable') as restricted_roads,
    count(*) filter (where passability = 'Passable') as passable_roads,
    count(*) filter (where passability = 'Unknown') as unknown_roads,
    max(observed_at) as latest_observed_at
  from current_reports group by municipality_id
)
select m.municipality_id, m.name as municipality_name,
  case when coalesce(s.roads_reported, 0) = 0 then 'Unknown'
    when s.impassable_roads > 0 then 'Impassable'
    when s.restricted_roads > 0 then 'Partially Passable'
    when s.unknown_roads > 0 then 'Unknown'
    when s.passable_roads > 0 then 'Passable'
    else 'Unknown' end as road_status,
  coalesce(s.roads_reported, 0::bigint) as roads_reported,
  coalesce(s.impassable_roads, 0::bigint) as impassable_roads,
  coalesce(s.restricted_roads, 0::bigint) as restricted_roads,
  s.latest_observed_at,
  (select jsonb_agg(jsonb_build_object(
    'road_name', r.road_name, 'barangay', r.barangay, 'status', r.status,
    'flood_condition', r.flood_condition, 'vehicle_access', r.vehicle_access,
    'reason', r.details, 'source', r.source_name, 'source_reference', r.source_reference,
    'observed_at', r.observed_at) order by r.observed_at desc)
   from current_reports r where r.municipality_id = m.municipality_id
     and r.passability in ('Impassable', 'Partially Passable', 'Unknown')) as affected_roads
from public.municipality_or_city m
left join summary s on s.municipality_id = m.municipality_id;
grant select on public.municipality_flood_road_status to authenticated;

-- Keep the earlier coverage view honest as well; existing columns stay intact.
create or replace view public.municipality_road_status
with (security_invoker = true) as
with latest_per_road as (
  select distinct on (r.municipality_id, lower(trim(r.road_name)), lower(trim(coalesce(r.barangay, ''))))
    r.municipality_id, r.road_name, r.barangay, r.status, r.observed_at, r.expires_at, r.created_at
  from public.road_passability_updates r
  where r.verification_status = 'verified' and r.observed_at <= now() + interval '1 minute'
    and coalesce(r.source_name, '') not ilike '%TEST DATA - FloodWatch Cebu%'
    and coalesce(r.details, '') not ilike '%TEST DATA ONLY%'
    and r.road_name not ilike 'TEST ROAD - %'
  order by r.municipality_id, lower(trim(r.road_name)), lower(trim(coalesce(r.barangay, ''))),
    r.observed_at desc, r.created_at desc
), counts as (
  select municipality_id, count(*)::integer as roads_reported,
    count(*) filter (where expires_at > now())::integer as current_road_reports,
    count(*) filter (where expires_at > now() and status in ('impassable', 'closed'))::integer as current_road_restrictions,
    max(observed_at) as latest_observed_at
  from latest_per_road group by municipality_id
)
select m.municipality_id, m.name as municipality_name,
  case when coalesce(c.roads_reported, 0) = 0 then 'unverified'
    when coalesce(c.current_road_reports, 0) = 0 then 'outdated_reports'
    else 'current_reports' end as report_status,
  coalesce(c.roads_reported, 0) as roads_reported,
  coalesce(c.current_road_reports, 0) as current_road_reports,
  coalesce(c.current_road_restrictions, 0) as current_road_restrictions,
  c.latest_observed_at
from public.municipality_or_city m left join counts c on c.municipality_id = m.municipality_id;
grant select on public.municipality_road_status to authenticated;
