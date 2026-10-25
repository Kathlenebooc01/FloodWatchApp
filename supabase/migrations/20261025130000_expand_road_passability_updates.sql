-- Keep each LGU submission as history. The client presents the newest update per road.
alter table public.road_passability_updates
  add column if not exists barangay text,
  add column if not exists vehicle_access text,
  add column if not exists flood_condition text;

alter table public.road_passability_updates
  drop constraint if exists road_passability_updates_status_check;

alter table public.road_passability_updates
  add constraint road_passability_updates_status_check
  check (status in (
    'passable', 'caution', 'partially_passable', 'impassable',
    'flooded', 'under_monitoring', 'closed', 'reopened', 'unknown'
  ));

-- Read access remains authenticated across Cebu; only the assigned LGU can insert.
