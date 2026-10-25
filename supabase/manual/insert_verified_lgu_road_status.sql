-- Paste this into Supabase SQL Editor after replacing every REPLACE_* value.
-- This records ONE actual LGU road observation. Run it again for each new update.
-- Nothing is inserted if a required value is missing or the LGU assignment differs.
do $$
declare
  v_municipality_name text := 'REPLACE_MUNICIPALITY_NAME';
  v_road_name text := 'REPLACE_ACTUAL_ROAD_NAME';
  v_status text := 'REPLACE_STATUS';
  v_lgu_email text := 'REPLACE_LGU_OFFICER_EMAIL';
  v_source_name text := 'REPLACE_OFFICIAL_SOURCE_NAME';
  v_source_reference text := 'REPLACE_OFFICIAL_REPORT_REFERENCE';
  v_observed_at timestamptz := null; -- Replace null with 'YYYY-MM-DD HH:MM:SS+08'::timestamptz

  v_barangay text := null;           -- Optional: actual barangay
  v_vehicle_access text := null;     -- Optional: actual vehicle restriction
  v_flood_condition text := null;    -- Required: actual observed flood condition
  v_remarks text := null;            -- Optional: LGU remarks

  v_municipality_id uuid;
  v_lgu_user_id uuid;
  v_new_id uuid;
begin
  if v_municipality_name like 'REPLACE_%'
     or v_road_name like 'REPLACE_%'
     or v_status like 'REPLACE_%'
     or v_lgu_email like 'REPLACE_%'
     or v_source_name like 'REPLACE_%'
     or v_source_reference like 'REPLACE_%'
     or v_observed_at is null
     or nullif(trim(v_flood_condition), '') is null then
    raise exception 'Replace all required values with a verified LGU road report before running this SQL';
  end if;

  if v_status not in (
    'passable', 'caution', 'partially_passable', 'impassable',
    'flooded', 'under_monitoring', 'closed', 'reopened', 'unknown'
  ) then
    raise exception 'Unsupported road status: %', v_status;
  end if;

  if v_observed_at > now() + interval '1 minute' then
    raise exception 'Observation time cannot be in the future';
  end if;

  select m.municipality_id into strict v_municipality_id
  from public.municipality_or_city m
  where lower(trim(m.name)) = lower(trim(v_municipality_name));

  select u.id into strict v_lgu_user_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(v_lgu_email))
    and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and p.municipality_id = v_municipality_id;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, barangay, vehicle_access,
    flood_condition, details, source_name, source_reference,
    observed_at, expires_at, created_by, verification_status
  ) values (
    v_municipality_id, trim(v_road_name), v_status, nullif(trim(v_barangay), ''),
    nullif(trim(v_vehicle_access), ''), nullif(trim(v_flood_condition), ''),
    nullif(trim(v_remarks), ''), trim(v_source_name), trim(v_source_reference),
    v_observed_at, v_observed_at + interval '6 hours', v_lgu_user_id, 'pending'
  ) returning id into v_new_id;

  raise notice 'Road observation submitted for verification. ID: %', v_new_id;
end;
$$;

-- Verify the latest entries after saving:
select m.name as municipality, r.road_name, r.status, r.barangay,
       r.observed_at, r.expires_at, r.source_name, r.source_reference, r.details
from public.road_passability_updates r
join public.municipality_or_city m on m.municipality_id = r.municipality_id
order by r.created_at desc
limit 10;
