-- Review simulated road observations before any manual cleanup.
select r.id, m.name as municipality, r.road_name, r.source_name, r.details,
       r.status, r.verification_status, r.created_at
from public.road_passability_updates r
join public.municipality_or_city m on m.municipality_id = r.municipality_id
where r.source_name ilike '%TEST DATA - FloodWatch Cebu%'
   or r.details ilike '%TEST DATA ONLY%'
   or r.road_name ilike 'TEST ROAD - %'
order by m.name, r.created_at;

-- Optional cleanup after reviewing the result above. This is intentionally
-- commented out. Prefer retaining history unless you explicitly decide to delete.
-- begin;
-- delete from public.road_passability_updates r
-- where r.source_name ilike '%TEST DATA - FloodWatch Cebu%'
--    or r.details ilike '%TEST DATA ONLY%'
--    or r.road_name ilike 'TEST ROAD - %';
-- commit;
