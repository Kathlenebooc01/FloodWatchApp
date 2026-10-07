import { supabase } from '@/utils/supabase';
import { LGU_REPORT_ROLES, SITUATIONAL_REPORT_FILTER, SituationalReport } from '@/utils/situational-report';

const fields = '*, reporter:profiles!user_id!inner(full_name, role, organization_name), place:specific_locations!fk_incident_report_specific_location(name), municipality:municipality_or_city!municipality_id(name)';
const query = () => supabase.from('incident_report').select(fields).or(SITUATIONAL_REPORT_FILTER).in('reporter.role', LGU_REPORT_ROLES);

export async function fetchSituationalReportTree(reportId: string): Promise<SituationalReport[]> {
    const visited = new Set<string>();
    let rootId = reportId;
    while (true) {
        if (visited.has(rootId)) throw new Error('The report relationship contains a cycle.');
        visited.add(rootId);
        const { data, error } = await query().eq('report_id', rootId).single();
        if (error) throw error;
        if (!data) throw new Error('The original report is unavailable.');
        if (!data.parent_report_id) break;
        rootId = data.parent_report_id;
    }
    // The existing workflow stores every update against the original root UUID.
    // Page through history instead of truncating at the API's default row limit.
    const rows: SituationalReport[] = [];
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await query()
            .or(`report_id.eq.${rootId},parent_report_id.eq.${rootId}`)
            .order('created_at', { ascending: true }).order('report_id', { ascending: true })
            .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data as unknown as SituationalReport[]));
        if (data.length < 500) break;
    }
    const root = rows.find(row => row.report_id === rootId);
    if (!root) throw new Error('The original report is unavailable.');
    return [root, ...rows.filter(row => row.report_id !== rootId)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.report_id.localeCompare(b.report_id))];
}
