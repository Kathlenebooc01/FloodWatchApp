import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRoadUpdates, roadStatusColor, roadStatusLabel } from '../utils/road-status-model.ts';

const update = (id, municipality_id, road_name, status, observed_at, barangay = null) => ({
  id, municipality_id, road_name, status, observed_at, barangay,
  created_at: observed_at, expires_at: '2026-10-25T08:00:00Z',
  vehicle_access: null, flood_condition: 'no flooding observed', details: null,
  source_name: 'Cebu LGU', verification_status: 'verified',
});

test('latest LGU status wins, roads and municipalities remain separate, expired latest stays visible', () => {
  const rows = [
    update('1', 'cebu', 'Main Road', 'passable', '2026-10-25T01:00:00Z'),
    update('2', 'cebu', 'Main Road', 'partially_passable', '2026-10-25T02:00:00Z'),
    update('3', 'cebu', 'Main Road', 'impassable', '2026-10-25T03:00:00Z'),
    update('4', 'cebu', 'Second Road', 'flooded', '2026-10-25T03:00:00Z'),
    update('5', 'lapu-lapu', 'Main Road', 'reopened', '2026-10-25T04:00:00Z'),
  ];
  const now = Date.parse('2026-10-25T10:00:00Z');
  assert.deepEqual(latestRoadUpdates(rows, 'cebu', now).map(row => [row.road_name, row.status]), [['Main Road', 'impassable'], ['Second Road', 'flooded']]);
  assert.deepEqual(latestRoadUpdates(rows, 'lapu-lapu', now).map(row => row.status), ['reopened']);
});

test('same road name in separate barangays and unknown statuses remain distinct', () => {
  const rows = [update('1', 'cebu', 'Coastal Road', 'closed', '2026-10-25T02:00:00Z', 'A'), update('2', 'cebu', 'Coastal Road', 'under_monitoring', '2026-10-25T03:00:00Z', 'B')];
  assert.equal(latestRoadUpdates(rows, 'cebu', Date.parse('2026-10-25T10:00:00Z')).length, 2);
  assert.equal(roadStatusLabel('under_monitoring'), 'Under monitoring');
  assert.equal(roadStatusColor('closed'), '#B91C1C');
});

test('pending and simulated road reports never appear as public road observations', () => {
  const real = update('real', 'cebu', 'Main Road', 'partially_passable', '2026-10-25T02:00:00Z');
  const pending = { ...update('pending', 'cebu', 'Main Road', 'impassable', '2026-10-25T03:00:00Z'), verification_status: 'pending' };
  const simulated = { ...update('test', 'cebu', 'TEST ROAD - Cebu City', 'passable', '2026-10-25T04:00:00Z'), source_name: 'TEST DATA - FloodWatch Cebu', details: 'TEST DATA ONLY' };
  assert.deepEqual(latestRoadUpdates([real, pending, simulated], 'cebu', Date.parse('2026-10-25T10:00:00Z')).map(row => row.id), ['real']);
});
