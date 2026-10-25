-- Rollback-only RLS smoke test. Uses existing citizen and LGU accounts.
begin;
create temporary table road_test_actors as
select
  (select id from public.profiles where role = 'citizen' limit 1) as citizen_id,
  (select id from public.profiles where role in ('lgu', 'lgu_frontliner', 'lgu_headmaster') and municipality_id is not null limit 1) as lgu_id,
  (select municipality_id from public.profiles where role in ('lgu', 'lgu_frontliner', 'lgu_headmaster') and municipality_id is not null limit 1) as lgu_municipality_id;
grant select on road_test_actors to authenticated;
set local role authenticated;
do $$
declare
  v_citizen uuid;
  v_lgu uuid;
  v_assigned uuid;
  v_other uuid;
  v_count bigint;
begin
  select citizen_id, lgu_id, lgu_municipality_id into v_citizen, v_lgu, v_assigned
    from road_test_actors;
  if v_citizen is null or v_lgu is null or v_assigned is null then
    raise exception 'Required citizen or LGU actor is unavailable';
  end if;
  select municipality_id into v_other from public.municipality_or_city
    where municipality_id <> v_assigned limit 1;

  perform set_config('request.jwt.claim.sub', v_citizen::text, true);
  select count(*) into v_count from public.road_passability_updates;
  if v_count <> 0 then raise exception 'Citizen can read unverified or simulated road rows'; end if;
  begin
    insert into public.road_passability_updates (
      municipality_id, road_name, status, flood_condition, source_name,
      observed_at, expires_at, created_by
    ) values (v_assigned, 'Citizen RLS smoke check', 'passable', 'no flooding observed',
      'Validation transaction', now(), now() + interval '1 hour', v_citizen);
    raise exception 'Citizen unexpectedly inserted a road observation';
  exception when others then
    if sqlerrm = 'Citizen unexpectedly inserted a road observation' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_lgu::text, true);
  begin
    insert into public.road_passability_updates (
      municipality_id, road_name, status, flood_condition, source_name,
      observed_at, expires_at, created_by
    ) values (v_other, 'Cross-LGU RLS smoke check', 'passable', 'no flooding observed',
      'Validation transaction', now(), now() + interval '1 hour', v_lgu);
    raise exception 'LGU unexpectedly inserted outside assigned municipality';
  exception when others then
    if sqlerrm = 'LGU unexpectedly inserted outside assigned municipality' then raise; end if;
  end;

  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, source_name,
    observed_at, expires_at, created_by
  ) values (v_assigned, 'Assigned LGU RLS smoke check', 'passable', 'no flooding observed',
    'Validation transaction', now(), now() + interval '1 hour', v_lgu);
end;
$$;
rollback;
