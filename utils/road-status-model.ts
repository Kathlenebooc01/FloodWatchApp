export type RoadStatus = 'passable' | 'caution' | 'partially_passable' | 'impassable' | 'flooded' | 'under_monitoring' | 'closed' | 'reopened' | 'unknown';
export type RoadUpdate = {
    id: string; municipality_id: string; road_name: string; barangay: string | null;
    status: RoadStatus; vehicle_access: string | null; flood_condition: string | null;
    details: string | null; source_name: string | null; source_reference: string | null;
    observed_at: string; expires_at: string; created_at: string;
    verification_status: 'pending' | 'verified' | 'rejected';
};

export type MunicipalityFloodRoadStatus = {
    municipality_id: string; municipality_name: string;
    road_status: 'Passable' | 'Partially Passable' | 'Impassable' | 'Unknown';
    roads_reported: number; impassable_roads: number; restricted_roads: number;
    latest_observed_at: string | null;
    affected_roads: { road_name: string; barangay: string | null; status: string;
        flood_condition: string | null; vehicle_access: string | null;
        reason: string | null; source: string | null; source_reference: string | null;
        observed_at: string }[] | null;
};

export function isSimulatedRoadUpdate(row: Pick<RoadUpdate, 'road_name' | 'details' | 'source_name'>) {
    return /test road\s*-/i.test(row.road_name) || /test data only/i.test(row.details || '')
        || /test data\s*-\s*floodwatch cebu/i.test(row.source_name || '');
}

export const ROAD_STATUS_OPTIONS: { value: RoadStatus; label: string }[] = [
    { value: 'passable', label: 'Passable' }, { value: 'partially_passable', label: 'Partially passable' },
    { value: 'impassable', label: 'Impassable' }, { value: 'flooded', label: 'Flooded' },
    { value: 'under_monitoring', label: 'Under monitoring' }, { value: 'closed', label: 'Closed' },
    { value: 'reopened', label: 'Reopened' }, { value: 'unknown', label: 'Unknown / unverified' },
    { value: 'caution', label: 'Caution' },
];

export function roadStatusLabel(status: string) {
    return ROAD_STATUS_OPTIONS.find(option => option.value === status)?.label || status.replace(/_/g, ' ');
}

export function roadStatusColor(status: string) {
    if (status === 'impassable' || status === 'closed') return '#B91C1C';
    if (status === 'flooded') return '#C2410C';
    if (status === 'caution' || status === 'partially_passable') return '#A16207';
    if (status === 'passable' || status === 'reopened') return '#047857';
    if (status === 'under_monitoring') return '#2563EB';
    return '#64748B';
}

export function latestRoadUpdates(rows: RoadUpdate[], municipalityId: string, nowMs = Date.now()) {
    const latest = new Map<string, RoadUpdate>();
    for (const row of [...rows].filter(item => String(item.municipality_id) === String(municipalityId)
        && item.verification_status === 'verified' && !isSimulatedRoadUpdate(item)
        && !!item.flood_condition?.trim() && Date.parse(item.observed_at) <= nowMs + 60000)
        .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at) || Date.parse(b.created_at) - Date.parse(a.created_at))) {
        const key = `${row.road_name.trim().toLowerCase()}|${(row.barangay || '').trim().toLowerCase()}`;
        if (!latest.has(key)) latest.set(key, row);
    }
    return [...latest.values()];
}
