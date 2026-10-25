# Live flood risk evidence

Apply `migrations/20261025180000_live_flood_risk_evidence.sql` after the verified road observation migration. The app requires its `municipality_flood_risk_evidence` view. The view returns one row per Cebu municipality and exposes counts and timestamps only, not citizen report details. The signed-in app reads it with the existing municipality, weather, and alert queries.

Deployed to the linked FloodWatch Supabase project with explicit user approval on 2026-10-25, and recorded as applied in migration history. Verification under the `authenticated` database role returned 54 distinct municipalities, including Lapu-Lapu. The REST query used by the app returned HTTP 200 with all 54 rows. Authenticated alert reads and Realtime publication were also verified. At verification time there were no active alerts or current verified flood observations; Unknown is therefore a valid assessment state, not a connection error.

Risk rules:

- **High Risk (red):** a current verified flood-related impassable or closed road observation, a verified incident with an explicit severe flood hazard classification, or a current active High/Critical FloodWatch alert. The details distinguish confirmed severe disruption from a high risk assessment.
- **Safe (orange):** a current verified precautionary road observation or a current active Safe/Moderate FloodWatch assessment, with no newer confirmed flood evidence.
- **Normal (green):** a current active Normal FloodWatch assessment, with no newer confirmed flood evidence. Individual passable roads do not establish normal conditions for the entire municipality.
- **Unknown (gray):** no current assessment, an unconfirmed severity for verified flooding, or unavailable backend evidence. Rainfall alone never proves flooding.

Road observations are counted only after verification and while unexpired. The latest verified observation for each road and barangay replaces older observations, including when the latest one expires. Reviewed flood incident reports are considered for six hours. A newer Normal assessment supersedes an older verified report, while a newer flood report removes Normal. Alerts are used for six hours from issue time. The app refreshes every minute and subscribes to road, incident, telemetry, and alert changes.

The existing schema does not contain a dedicated verified water-level observation feed, so water level is not inferred. A structured, verified water-level source can be added to the view when one is available. Apply migrations to the linked Supabase project before shipping the updated app; until the view exists, weather still loads but every flood risk is Unknown and the app shows an evidence warning.

To inspect coverage after applying the migration:

```sql
select count(*) from public.municipality_flood_risk_evidence;
select m.name, e.* from public.municipality_flood_risk_evidence e
join public.municipality_or_city m using (municipality_id)
where m.name ilike '%Lapu%' or m.name ilike '%Mandaue%' or m.name ilike '%Cebu%';
```
