import { supabase } from './supabase';
import type { MunicipalityFloodRoadStatus, RoadUpdate } from './road-status-model';
export { latestRoadUpdates, roadStatusColor, roadStatusLabel, ROAD_STATUS_OPTIONS } from './road-status-model';
export type { RoadStatus, RoadUpdate, MunicipalityFloodRoadStatus } from './road-status-model';

export async function loadRoadUpdates(municipalityId?: string): Promise<{ rows: RoadUpdate[] }> {
    const rows: RoadUpdate[] = [];
    for (let page = 0; ; page++) {
        let query = supabase.from('road_passability_updates')
            .select('id,municipality_id,road_name,barangay,status,vehicle_access,flood_condition,details,source_name,source_reference,observed_at,expires_at,created_at,verification_status')
            .eq('verification_status', 'verified')
            .order('observed_at', { ascending: false }).order('created_at', { ascending: false });
        if (municipalityId) query = query.eq('municipality_id', municipalityId);
        const { data, error } = await query.range(page * 500, page * 500 + 499);
        if (error) throw error;
        rows.push(...(data || []) as RoadUpdate[]);
        if (!data || data.length < 500) break;
    }
    return { rows };
}

export async function loadMunicipalityFloodRoadStatuses(): Promise<MunicipalityFloodRoadStatus[]> {
    const { data, error } = await supabase.from('municipality_flood_road_status')
        .select('municipality_id,municipality_name,road_status,roads_reported,impassable_roads,restricted_roads,latest_observed_at,affected_roads')
        .order('municipality_name');
    if (error) throw error;
    return (data || []) as MunicipalityFloodRoadStatus[];
}
