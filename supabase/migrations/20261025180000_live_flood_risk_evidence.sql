-- Public, municipality-scoped evidence only. Do not expose citizen report text or identity.
-- The view owner can read reviewed reports across LGU RLS boundaries; clients only
-- receive the aggregate below. Apply after the verified road observation migration.
begin;

create or replace view public.municipality_flood_risk_evidence as
with latest_road as (
  select distinct on (r.municipality_id, lower(trim(r.road_name)), lower(trim(coalesce(r.barangay, ''))))
    r.municipality_id, r.status, r.flood_condition, r.observed_at, r.expires_at
  from public.road_passability_updates r
  where r.verification_status = 'verified'
    and r.verified_by is not null and r.verified_at <= now()
    and r.observed_at <= now()
    and coalesce(r.source_name, '') not ilike '%TEST DATA - FloodWatch Cebu%'
    and coalesce(r.details, '') not ilike '%TEST DATA ONLY%'
    and r.road_name not ilike 'TEST ROAD - %'
  order by r.municipality_id, lower(trim(r.road_name)),
    lower(trim(coalesce(r.barangay, ''))), r.observed_at desc, r.created_at desc, r.id desc
), road as (
  select municipality_id,
    max(observed_at) filter (where expires_at > now()) as road_observed_at,
    count(*) filter (where expires_at > now() and status in ('impassable', 'closed')
      and flood_condition ~* '(flood|inundat|submerg|high water|overflow)'
      and flood_condition !~* '(no flood|not flood|past flood|flood.*subsided|flood.*cleared)')::integer as severe_flood_roads,
    count(*) filter (where expires_at > now() and status in ('flooded', 'partially_passable', 'caution')
      and flood_condition ~* '(flood|inundat|submerg|high water|overflow)'
      and flood_condition !~* '(no flood|not flood|past flood|flood.*subsided|flood.*cleared)')::integer as flooded_roads,
    count(*) filter (where expires_at > now() and status = 'under_monitoring'
      and flood_condition !~* '(flood|inundat|submerg|high water|overflow)')::integer as precaution_roads
  from latest_road group by municipality_id
), reports as (
  select i.municipality_id,
    max(i.created_at) filter (where i.situation_status is distinct from 'Resolved') as latest_flood_report_at,
    count(*) filter (where i.situation_status is distinct from 'Resolved')::integer as verified_flood_reports,
    count(*) filter (where i.situation_status is distinct from 'Resolved'
      and i.hazard_type ~* '(severe|heavy|major|critical)[[:space:]_-]*(flood|inundat)|(flood|inundat)[[:space:]_-]*(severe|heavy|major|critical)')::integer as severe_flood_reports
  from public.incident_report i
  where i.status = 'Verified' and i.municipality_id is not null
    and i.reviewed_by is not null and i.reviewed_at <= now()
    and i.created_at > now() - interval '6 hours' and i.created_at <= now()
    and (i.hazard_type ilike '%flood%' or i.hazard_type ilike '%inundat%')
    and i.report_type in ('quick_snap', 'moderate_report', 'situational_report', 'situational')
    and coalesce(i.description, '') not ilike '%TEST DATA ONLY%'
  group by i.municipality_id
)
select m.municipality_id,
  coalesce(r.severe_flood_roads, 0) as severe_flood_roads,
  coalesce(r.flooded_roads, 0) as flooded_roads,
  coalesce(r.precaution_roads, 0) as precaution_roads,
  r.road_observed_at,
  coalesce(i.verified_flood_reports, 0) as verified_flood_reports,
  coalesce(i.severe_flood_reports, 0) as severe_flood_reports,
  i.latest_flood_report_at
from public.municipality_or_city m
left join road r on r.municipality_id = m.municipality_id
left join reports i on i.municipality_id = m.municipality_id;

revoke all on public.municipality_flood_risk_evidence from public, anon;
grant select on public.municipality_flood_risk_evidence to authenticated;

-- The deployed alerts table has RLS enabled but no SELECT policy. Publish only
-- reads here; alert creation remains restricted to the trusted backend.
drop policy if exists "Signed-in users read municipality alerts" on public.municipality_alerts;
create policy "Signed-in users read municipality alerts"
  on public.municipality_alerts for select to authenticated using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'municipality_alerts') then
    alter publication supabase_realtime add table public.municipality_alerts;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
