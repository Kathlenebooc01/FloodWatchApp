-- One live coverage row for every supported Cebu city or municipality.
-- This is a view, so it never creates fictional road observations.
create or replace view public.municipality_road_status
with (security_invoker = true)
as
with latest_per_road as (
  select distinct on (
    r.municipality_id,
    lower(trim(r.road_name)),
    lower(trim(coalesce(r.barangay, ''))))
    r.municipality_id,
    r.road_name,
    r.barangay,
    r.status,
    r.observed_at,
    r.expires_at,
    r.created_at
  from public.road_passability_updates r
  where r.observed_at <= now() + interval '1 minute'
  order by r.municipality_id,
           lower(trim(r.road_name)),
           lower(trim(coalesce(r.barangay, ''))),
           r.observed_at desc,
           r.created_at desc
), counts as (
  select municipality_id,
         count(*)::integer as roads_reported,
         count(*) filter (where expires_at > now())::integer as current_road_reports,
         count(*) filter (
           where expires_at > now() and status in ('impassable', 'closed')
         )::integer as current_road_restrictions,
         max(observed_at) as latest_observed_at
  from latest_per_road
  group by municipality_id
)
select m.municipality_id,
       m.name as municipality_name,
       case
         when coalesce(c.roads_reported, 0) = 0 then 'unverified'
         when coalesce(c.current_road_reports, 0) = 0 then 'outdated_reports'
         else 'current_reports'
       end as report_status,
       coalesce(c.roads_reported, 0) as roads_reported,
       coalesce(c.current_road_reports, 0) as current_road_reports,
       coalesce(c.current_road_restrictions, 0) as current_road_restrictions,
       c.latest_observed_at
from public.municipality_or_city m
left join counts c on c.municipality_id = m.municipality_id;

grant select on public.municipality_road_status to authenticated;
comment on view public.municipality_road_status is
  'Coverage of published road reports for each Cebu municipality; report_status is not a claim that all roads are passable.';
