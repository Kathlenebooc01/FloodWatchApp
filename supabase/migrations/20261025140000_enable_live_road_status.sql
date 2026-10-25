-- Stream road updates to signed-in Citizen and LGU clients.
-- The existing SELECT policy controls which rows each client may receive.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'supabase_realtime publication is missing';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'road_passability_updates'
  ) then
    alter publication supabase_realtime add table public.road_passability_updates;
  end if;
end;
$$;
