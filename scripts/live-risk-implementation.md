# Live Risk implementation

The dashboard Live Risk card opens `components/live-risk-modal.tsx` for Citizen and LGU users. Search retains the pinned municipality. Cards open details by municipality ID, never by partial name. The modal uses slide animation, safe-area layout, accessible controls, loading placeholders, retry controls and a virtualized municipality list.

## Existing data sources

- `municipality_or_city`: dynamic municipality IDs, names and center coordinates. Parent records are paginated; embedded observation/alert queries are limited per municipality.
- `weather_telemetry`: most recent observation by `fetched_at`, including rainfall, temperature, humidity, wind, rainfall category and expiry. No duplicate weather table was added. Stale or missing saved readings are refreshed from the existing keyless Open-Meteo current-weather source using backend municipality coordinates.
- `municipality_alerts`: most recent active alert per municipality. Risk labels are backend values; known Low/Moderate/High/Critical levels receive semantic colors. Missing classifications remain unknown internally, regardless of rainfall amounts. At the user's request, the display label is Normal; missing assessment explanations remain visible.
- `profiles`: authenticated user's role and assigned/registered municipality. LGU assignment always takes precedence over device location. Citizens use a fresh GPS fix (within five minutes, accuracy at most 100 m), matched using the device's reverse-geocoded city and an exact, unique municipality name. Missing permission, poor accuracy, timeout or ambiguous names fall back to registration. There is no default municipality.
- `incident_report` and `specific_locations`: paginated flood-related reports with Verified/verified status and exact municipality ID. Reports are historical records, not assertions of current flooding. Rejected, pending and merely accepted statuses are excluded.

All reads use existing authenticated Supabase/RLS access. In particular, the existing restrictive LGU incident-report policy prevents reading other municipalities' reports. This feature does not bypass that restriction. The details explain that reports shown are limited to records accessible to the account. Weather exploration does not grant report administration access.

## Refresh, offline use and notifications

Snapshots share in-flight requests and cache for five minutes, separately per authenticated user, in memory and AsyncStorage. A failed refresh retains the last snapshot with a visible warning. Observation expiry and a conservative 30-minute display freshness limit mark old observations; that limit is a UI freshness rule, not a rainfall threshold. Missing rainfall stays unavailable; an actual measured zero remains zero. Polling while open and app-resume checks provide fallback when realtime is unavailable. Debounced Supabase weather/alert events invalidate the cache when those tables are published to Realtime.

The user's active elevated municipality alert is displayed inside Live Risk. The existing notification banner is reused, with a persistent per-user/per-municipality fingerprint of the alert ID, issue time and level to suppress unchanged warnings. No notification-table writes, push subscriptions or escalation workflows were added or changed.

The dashboard's embedded OpenWeather credential and fabricated success/failure defaults were removed. The feature prioritizes fresh backend observations and restores the existing public Open-Meteo fallback when telemetry is old. Requests carry up to 20 coordinate pairs, run at most three batches concurrently, cache successful results for 15 minutes, and back off failed attempts for three minutes. Provider timestamps are preserved, current model estimates are attributed to Open-Meteo, and missing rainfall never becomes zero. No API keys are added or exposed, no provider credentials are bundled, and no database weather rows are written. The backend ingestion job remains responsible for persisting telemetry.

## Honest unavailable states

The checked-in schema does not provide rainfall measurement periods, wind units, validated threshold assessments, hourly forecasts, or source-linked PAGASA advisories. Those values are not inferred. Open-Meteo fallback records retain their explicitly supplied interval and wind units. Forecasts are not requested by this current-weather fallback. The old dashboard's numeric thresholds mixed one-hour and three-hour totals and were not a validated backend assessment; they are not reused as authoritative risk classifications.

The next 2–3 hours section explicitly reports forecast unavailability. The PAGASA section explains that live official advisories are not integrated and links to the official Visayas regional page at https://www.pagasa.dost.gov.ph/regional-forecast/visprsd (reviewed during implementation). No scraped or static advisory is presented as current. A future ingestion integration needs observation periods/units and time-stamped, location-specific forecasts/advisories before these sections can display them.

No interactive flood map exists in the inspected mobile routes, so no duplicate map or nonfunctional map button was introduced.

## Validation

Run `node scripts/test-live-risk.cjs` for deterministic regression tests of exact location matching, Citizen/LGU priority, missing data, risk classification passthrough, per-municipality queries, caching, concurrent requests, account isolation and network errors. These tests use backend/device stubs; they do not establish production ingestion or RLS behavior.

Run `npx eslint components/live-risk-modal.tsx utils/live-risk.ts utils/live-risk-model.ts utils/live-weather.ts --no-cache` for focused lint validation.

`npx tsc --noEmit --incremental false` has existing errors in `check_db.ts`, `debug_notifs.ts`, `test_fetch.ts` and `utils/firebase.ts` (Node typings and absent dotenv/Firebase modules). No new TypeScript errors remained after fixing the query chain.

A read-only anonymous request against the configured Supabase accepted the embedded relationships (HTTP 200), but returned zero visible municipality rows. No authenticated Citizen/LGU session or physical device was available for end-to-end validation.

Before release, verify authenticated municipality/telemetry/alert visibility, GPS priority for Lapu-Lapu and Cebu Citizens, Mandaue LGU assignment, report permissions, long names and large font sizes, Android back/iOS sheet dismissal, cached offline use and actual backend Realtime publication. Existing global connectivity UI may still block other app interaction during offline conditions; it was not changed.

Live-weather regression validation: 41 tests pass, including freshness, coordinate batching, null rainfall, provider caching, rate-limit backoff, and preserving old readings on failures. A direct read-only Open-Meteo request returned HTTP 200 with current values, source timestamp, 900-second interval and explicit units. Device-level authenticated verification is still required.
