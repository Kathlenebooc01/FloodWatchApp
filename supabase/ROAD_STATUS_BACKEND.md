# Backend-managed Cebu road status

The mobile app reads `public.road_passability_updates` for the selected municipality and subscribes to Supabase Realtime changes. No road condition is inferred from rainfall or weather. The `municipality_or_city` table contains 54 Cebu Province cities and municipalities. Only verified, unexpired, non-simulated flood observations influence the public municipality passability view.

## Municipality flood road passability

`public.municipality_flood_road_status` returns all 54 municipalities. `road_status` is `Unknown`, `Passable`, `Partially Passable`, or `Impassable`. This summarizes **reported roads only**, not every road in the municipality. An observation marked `flooded` without an explicit passability decision remains `Unknown`. The newest verified current observation for each road and barangay wins; pending or expired observations never contribute. A city with no current verified road observation displays `Unknown — No verified road observation available`.

The Live Risk municipality cards show the summary and Municipality Details shows the actual road observations, their flood condition, vehicle access, source, reason, and observation time. The view recalculates from the existing table; no status rows are fabricated.

## LGU review workflow

The LGU Operational Hub has a **Road observations** screen. An LGU officer submits observations for their assigned municipality; each submission is a new history row with `verification_status = pending`. An assigned `lgu_headmaster`, provincial admin, or national admin can review it through `review_flood_road_observation`. The database checks the reviewer role and municipality. Direct client updates and deletions are not granted. To update a road condition, submit a newer observation and verify it. Verified observations must include a flood condition; affected roads also require vehicle access and a reason. Reports expire at most six hours after observation.

The previously inserted `TEST DATA - FloodWatch Cebu` rows remain in the database as pending history, and RLS plus both views exclude them. Review them with [`manual/review_test_road_observations.sql`](manual/review_test_road_observations.sql). Its optional delete is commented out.

## All 54 municipalities at a glance

The read-only `public.municipality_road_status` **view** has one row for every city or municipality in `municipality_or_city`. Open it under **Database → Views** in Supabase, or run:

```sql
select municipality_name, report_status, roads_reported,
       current_road_reports, current_road_restrictions, latest_observed_at
from public.municipality_road_status
order by municipality_name;
```

`report_status` is `unverified` when no verified road report exists, `current_reports` when at least one latest verified road report is still valid, and `outdated_reports` when all latest verified reports have expired. It describes **report coverage**, not whether every road in that municipality is passable. The view updates automatically from `road_passability_updates`; do not insert into the view.

## Enter a verified LGU report

For any of the 54 Cebu cities and municipalities, paste [`manual/insert_verified_cebu_road_status.sql`](manual/insert_verified_cebu_road_status.sql) into the Supabase SQL Editor. Replace its required values with an actual official road report before running it. It validates the municipality, provincial/national admin operator, status, flood condition, source, and observation time. It rejects untouched placeholders and does not generate road conditions. The SQL Editor is privileged, so use it only for reviewed official records.

For a report entered by an LGU officer assigned to that municipality, use [`manual/insert_verified_lgu_road_status.sql`](manual/insert_verified_lgu_road_status.sql) instead. This template creates a **pending** observation for subsequent review.

The connected backend currently has LGU accounts assigned to **two** municipalities. The approved backend-admin policy allows provincial and national admins to publish verified reports for the remaining municipalities. This permission does not create road reports automatically.

1. Choose the `municipality_id` from `municipality_or_city`. Use the UUID for the municipality where the road is located.
2. Enter the actual `road_name`, `status`, and `observed_at` from the official report. Provide `source_name` and `source_reference` so readers can identify its origin. Optional fields are `barangay`, `vehicle_access`, `flood_condition`, and `details`.
3. Enter the email of the authorized operator. The SQL template resolves the user ID and validates their role before saving it as `created_by`.
4. Set `expires_at` later than `observed_at` and no more than six hours later. The app keeps the latest expired report visible with an outdated warning until a newer report arrives.
5. Save a **new row** for each change to a road's condition. This preserves history. The app displays the latest report for each road and barangay.

Allowed `status` values: `passable`, `caution`, `partially_passable`, `impassable`, `flooded`, `under_monitoring`, `closed`, `reopened`, `unknown`.

Check that the chosen municipality ID and LGU assignment match before publishing:

```sql
select m.municipality_id, m.name, p.id as lgu_user_id, p.role
from public.municipality_or_city m
join public.profiles p on p.municipality_id = m.municipality_id
where p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
order by m.name;
```

Signed-in Citizens see verified, non-simulated observations. Assigned LGUs can submit pending observations for their municipality and review their local submissions; provincial and national admins may review observations across Cebu. Dashboard SQL operators must use genuine official reports, because the Dashboard can bypass app-side controls.

Realtime makes **published backend changes appear automatically in the app**. It does not discover road conditions on its own. A road without a verified report remains unverified.

