-- Road conditions are municipality-scoped, time-limited LGU updates.
create table if not exists public.road_passability_updates (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality_or_city(municipality_id),
  road_name text not null check (length(trim(road_name)) between 2 and 160),
  status text not null check (status in ('passable', 'caution', 'impassable')),
  details text,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (expires_at > observed_at and expires_at <= observed_at + interval '6 hours')
);

create index if not exists road_passability_updates_recent_idx
  on public.road_passability_updates (municipality_id, observed_at desc);

alter table public.road_passability_updates enable row level security;

drop policy if exists "Signed-in users read road updates" on public.road_passability_updates;
create policy "Signed-in users read road updates"
  on public.road_passability_updates for select to authenticated
  using (true);

drop policy if exists "Assigned LGU posts road updates" on public.road_passability_updates;
create policy "Assigned LGU posts road updates"
  on public.road_passability_updates for insert to authenticated
  with check (
    created_by = auth.uid() and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
        and p.municipality_id = road_passability_updates.municipality_id
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'road_passability_updates'
     ) then
    alter publication supabase_realtime add table public.road_passability_updates;
  end if;
end;
$$;
