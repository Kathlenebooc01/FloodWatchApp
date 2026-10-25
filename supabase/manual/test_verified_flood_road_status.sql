-- Read/write smoke test. All inserted observations are rolled back.
begin;
do $$
declare
  v_municipality uuid;
  v_actor uuid;
  v_road text := 'Verification smoke check ' || gen_random_uuid()::text;
  v_status text;
begin
  select municipality_id into v_municipality from public.municipality_or_city order by name limit 1;
  select id into v_actor from auth.users order by created_at limit 1;
  if v_municipality is null or v_actor is null then raise exception 'Missing municipality or auth user'; end if;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, source_name,
    observed_at, expires_at, created_by, verification_status, verified_by, verified_at
  ) values (
    v_municipality, v_road, 'passable', 'no flooding observed', 'Validation transaction',
    now() - interval '3 hours', now() + interval '2 hours', v_actor,
    'verified', v_actor, now()
  );
  select road_status into v_status from public.municipality_flood_road_status where municipality_id = v_municipality;
  if v_status <> 'Passable' then raise exception 'Expected early Passable, got %', v_status; end if;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, vehicle_access, details,
    source_name, observed_at, expires_at, created_by, verification_status, verified_by, verified_at
  ) values (
    v_municipality, v_road, 'impassable', 'past floodwater', 'No vehicle access',
    'Past flood closure', 'Validation transaction', now() - interval '2 hours',
    now() - interval '1 hour', v_actor, 'verified', v_actor, now()
  );
  select road_status into v_status from public.municipality_flood_road_status where municipality_id = v_municipality;
  if v_status <> 'Unknown' then raise exception 'Expired observation affected status: %', v_status; end if;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, vehicle_access, details,
    source_name, observed_at, expires_at, created_by
  ) values (
    v_municipality, v_road, 'impassable', 'unreviewed floodwater', 'No vehicle access',
    'Pending flood closure', 'Validation transaction', now() - interval '3 minutes',
    now() + interval '3 hours', v_actor
  );
  select road_status into v_status from public.municipality_flood_road_status where municipality_id = v_municipality;
  if v_status <> 'Unknown' then raise exception 'Pending observation affected status: %', v_status; end if;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, vehicle_access, details,
    source_name, observed_at, expires_at, created_by, verification_status, verified_by, verified_at
  ) values (
    v_municipality, v_road, 'flooded', 'floodwater reported', 'Access not confirmed',
    'Floodwater was observed; passability was not confirmed', 'Validation transaction',
    now() - interval '2 minutes 30 seconds', now() + interval '3 hours', v_actor,
    'verified', v_actor, now()
  );
  select road_status into v_status from public.municipality_flood_road_status where municipality_id = v_municipality;
  if v_status <> 'Unknown' then raise exception 'Flooding alone inferred passability: %', v_status; end if;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, source_name,
    observed_at, expires_at, created_by, verification_status, verified_by, verified_at
  ) values (
    v_municipality, v_road, 'passable', 'no flooding observed', 'Validation transaction',
    now() - interval '2 minutes', now() + interval '3 hours', v_actor,
    'verified', v_actor, now()
  );
  select road_status into v_status from public.municipality_flood_road_status where municipality_id = v_municipality;
  if v_status <> 'Passable' then raise exception 'Expected Passable, got %', v_status; end if;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, vehicle_access, details,
    source_name, observed_at, expires_at, created_by, verification_status, verified_by, verified_at
  ) values (
    v_municipality, v_road, 'impassable', 'floodwater on roadway', 'No vehicle access',
    'Floodwater blocks the road', 'Validation transaction',
    now() - interval '1 minute', now() + interval '3 hours', v_actor,
    'verified', v_actor, now()
  );
  select road_status into v_status from public.municipality_flood_road_status where municipality_id = v_municipality;
  if v_status <> 'Impassable' then raise exception 'Expected Impassable, got %', v_status; end if;
end;
$$;
rollback;
