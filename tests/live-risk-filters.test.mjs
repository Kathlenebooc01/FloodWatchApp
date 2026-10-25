import test from 'node:test';
import assert from 'node:assert/strict';
import { matchMunicipality, matchesRiskFilter, prioritize, riskFor } from '../utils/live-risk-model.ts';

const now = Date.parse('2026-10-25T06:00:00Z');
const row = (id, name, level, active = true, issuedAt = '2026-10-25T05:00:00Z') => ({
  municipality_id: id, province_id: 'cebu', name,
  center_latitude: null, center_longitude: null, weather_telemetry: [],
  municipality_alerts: level ? [{ id: `${id}-alert`, alert_level: level, issued_at: issuedAt, is_active: active }] : [],
});

test('Lapu-Lapu geocoder spelling variants resolve to the same municipality ID', () => {
  const municipalities = [row('lapu', 'LAPU-LAPU CITY', null), row('cebu', 'CEBU CITY', null)];
  for (const name of ['Lapu Lapu City', 'City of Lapu-Lapu', 'LAPU–LAPU CITY']) {
    assert.equal(matchMunicipality(municipalities, name), 'lapu');
  }
  assert.equal(matchMunicipality(municipalities, 'Cebu'), null);
  assert.equal(matchMunicipality(municipalities, 'Buaya'), null);
  assert.equal(matchMunicipality(municipalities, ''), null);
});

test('a working feed with no current reports remains Unknown even with zero rainfall', () => {
  const place = row('lapu', 'Lapu-Lapu City', null);
  place.weather_telemetry = [{ rainfall_mm: 0, fetched_at: new Date(now).toISOString() }];
  place.flood_evidence = { municipality_id: 'lapu', severe_flood_roads: 0, flooded_roads: 0, precaution_roads: 0, verified_flood_reports: 0, severe_flood_reports: 0, road_observed_at: null, latest_flood_report_at: null };
  assert.equal(riskFor(place, now).level, 'Unknown');
  assert.equal(matchesRiskFilter(place, 'normal', now), false);
  assert.equal(matchesRiskFilter(place, 'safe', now), false);
  assert.equal(matchesRiskFilter(place, 'all', now), true);
});

test('filters require an explicit active backend classification', () => {
  const rows = [row('1', 'Alpha', 'Safe'), row('2', 'Bravo', 'Normal'), row('3', 'Charlie', 'High Risk'), row('4', 'Delta', 'Critical'), row('5', 'Echo', null), row('6', 'Foxtrot', 'High', false), row('7', 'Golf', 'High', true, '2026-10-26T00:00:00Z')];
  assert.equal(rows.filter(item => matchesRiskFilter(item, 'all', now)).length, 7);
  assert.deepEqual(rows.filter(item => matchesRiskFilter(item, 'safe', now)).map(item => item.name), ['Alpha']);
  assert.deepEqual(rows.filter(item => matchesRiskFilter(item, 'normal', now)).map(item => item.name), ['Bravo']);
  assert.deepEqual(rows.filter(item => matchesRiskFilter(item, 'high', now)).map(item => item.name), ['Charlie', 'Delta']);
});

test('verified severe flooding changes only the affected municipality and expires with the evidence feed', () => {
  const flooded = row('1', 'Lapu-Lapu City', null);
  flooded.flood_evidence = { municipality_id: '1', severe_flood_roads: 1, flooded_roads: 0, precaution_roads: 0, verified_flood_reports: 0, road_observed_at: '2026-10-25T05:30:00Z', latest_flood_report_at: null };
  const neighbor = row('2', 'Cebu City', null);
  assert.equal(riskFor(flooded, now).level, 'High Risk');
  assert.equal(riskFor(flooded, now).color, '#DC2626');
  assert.equal(matchesRiskFilter(flooded, 'high', now), true);
  assert.equal(riskFor(neighbor, now).level, 'Unknown');
  flooded.flood_evidence.severe_flood_roads = 0;
  assert.equal(matchesRiskFilter(flooded, 'high', now), false);
});

test('normal clearance must be newer than a verified flood report', () => {
  const place = row('1', 'Mandaue City', 'Normal', true, '2026-10-25T05:45:00Z');
  place.flood_evidence = { municipality_id: '1', severe_flood_roads: 0, flooded_roads: 0, precaution_roads: 0, verified_flood_reports: 1, road_observed_at: null, latest_flood_report_at: '2026-10-25T05:30:00Z' };
  assert.equal(riskFor(place, now).level, 'Normal');
  place.flood_evidence.latest_flood_report_at = '2026-10-25T05:50:00Z';
  assert.equal(riskFor(place, now).level, 'Unknown');
  assert.equal(matchesRiskFilter(place, 'normal', now), false);
});

test('search and selected filter respect municipality priority without forcing an unmatched location', () => {
  const rows = [row('1', 'Cebu City', 'Normal'), row('2', 'Mandaue City', 'High'), row('3', 'Lapu-Lapu City', 'High')];
  assert.deepEqual(prioritize(rows, '2').map(item => item.name), ['Mandaue City', 'Cebu City', 'Lapu-Lapu City']);
  assert.deepEqual(prioritize(rows.filter(item => matchesRiskFilter(item, 'high', now)), '1').map(item => item.name), ['Lapu-Lapu City', 'Mandaue City']);
  assert.deepEqual(prioritize(rows.filter(item => matchesRiskFilter(item, 'high', now)), '2', 'lapu').map(item => item.name), ['Lapu-Lapu City']);
});
