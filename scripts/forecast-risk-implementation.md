# Next 2–3 hours predicted flood risk

This change removes only the `RoadStatusSection` render from Municipality Details and adds `PredictedFloodRisk` inside the existing forecast section. The current risk assessment, municipality cards and filters, road data and APIs, advisories, and navigation are unchanged.

## Rule provenance and limits

The linked Supabase view `public.municipality_flood_risk`, inspected on 2026-10-26, classifies its rainfall amount as Low below 5 mm, Moderate from 5 mm to below 20 mm, and High at or above 20 mm. It provides neither a measurement period nor validation metadata. No documented validated municipal forecast model was found in the repository or the inspected database definitions.

The new assessment reuses those existing amounts against **total forecast precipitation in the displayed period**. This interpretation is provisional and requires local validation before it can be treated as an operational flood prediction. The qualification is displayed alongside every calculated level. It is not presented as a PAGASA warning or a scientifically validated threshold. No new scientific threshold is introduced. If the backend amount rules are revised, update `FORECAST_RAINFALL_RULE` after confirming the intended forecast duration and validation status.

Hourly intensity is retained as the peak hourly rainfall amount and included in the explanation; no undocumented intensity multiplier or susceptibility adjustment is applied. Rain probability cannot raise the risk level. For example, 100% hourly probability with a total of 0.3 mm remains provisional Low. No current alerts, road observations, or current risk labels are inputs to this calculation. A predicted High cannot modify the current assessment or its filter.

## Forecast period and missing data

- The prediction uses actual Open-Meteo hourly amounts at the selected municipality's existing coordinates. The existing weather forecast retains its OpenWeather/Open-Meteo provider preference. An OpenWeather three-hour total is never divided into invented hourly values.
- Only complete future hours that end within three hours of now are assessed. This normally supplies two hours, or three exactly at an hour boundary. The exact period is shown in Philippine time. Partial hours are not prorated, and rainfall beyond that window is excluded.
- Expected rainfall is the sum of those hourly amounts. The displayed rain probability is the highest supplied hourly probability, explicitly labeled as such; it is not a combined probability for the whole window.
- Fewer than two contiguous hourly periods, missing or invalid rainfall amounts, expired data, or API failures without a valid recent cache produce gray Unknown and `Forecast Risk Unavailable`. Missing probability is shown as unavailable, but valid rainfall amounts can still support the amount-based estimate.

The separate hourly cache is keyed by coordinates and lasts ten minutes. A valid Open-Meteo forecast already fetched for the existing section can be reused. The component uses the page's ten-minute, hour-boundary, and manual refresh triggers, refreshes on app resume, and cancels obsolete requests on municipality changes or unmount. Requests are skipped in the background. No backend records are written.

## Verification

`node --test tests/forecast-risk.test.mjs tests/live-forecast.test.mjs tests/live-risk-filters.test.mjs`

These tests cover amount boundaries, high probability with light rain, accumulation, peak intensity, future windows, null and invalid values, stale forecasts, municipality coordinate isolation, cache reuse, API failures, and independence from the current assessment.
