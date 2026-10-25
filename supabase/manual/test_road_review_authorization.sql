-- Rollback-only authorization smoke test using existing account roles.
begin;
do $$
declare
  v_citizen uuid;
  v_headmaster uuid;
  v_headmaster_municipality uuid;
  v_admin uuid;
  v_other_municipality uuid;
  v_id uuid;
  v_status text;
begin
  select id into v_citizen from public.profiles where role = 'citizen' limit 1;
  select id, municipality_id into v_headmaster, v_headmaster_municipality
    from public.profiles where role = 'lgu_headmaster' and municipality_id is not null limit 1;
  select id into v_admin from public.profiles where role in ('provincial_admin', 'national_admin') limit 1;
  select municipality_id into v_other_municipality from public.municipality_or_city
    where municipality_id <> v_headmaster_municipality limit 1;
  if v_citizen is null or v_headmaster is null or v_admin is null or v_other_municipality is null then
    raise exception 'Required test account roles are unavailable';
  end if;
  insert into public.road_passability_updates (
    municipality_id, road_name, status, flood_condition, source_name,
    observed_at, expires_at, created_by
  ) values (
    v_other_municipality, 'Authorization smoke check ' || gen_random_uuid(),
    'passable', 'no flooding observed', 'Validation transaction',
    now() - interval '1 minute', now() + interval '3 hours', v_admin
  ) returning id into v_id;

  perform set_config('request.jwt.claim.sub', v_citizen::text, true);
  begin
    perform public.review_flood_road_observation(v_id, 'verified');
    raise exception 'Citizen unexpectedly verified a road observation';
  exception when others then
    if sqlerrm = 'Citizen unexpectedly verified a road observation' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_headmaster::text, true);
  begin
    perform public.review_flood_road_observation(v_id, 'verified');
    raise exception 'Other municipality LGU unexpectedly verified a road observation';
  exception when others then
    if sqlerrm = 'Other municipality LGU unexpectedly verified a road observation' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.review_flood_road_observation(v_id, 'verified');
  select verification_status into v_status from public.road_passability_updates where id = v_id;
  if v_status <> 'verified' then raise exception 'Admin review failed'; end if;
end;
$$;
rollback;
