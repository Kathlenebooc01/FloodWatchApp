export const LGU_REPORT_ROLES = ['lgu', 'lgu_frontliner', 'lgu_headmaster'];
export const SITUATIONAL_REPORT_FILTER = 'hazard_type.like.[SITUATIONAL]%,report_type.eq.situational_report,report_type.eq.situational';

export function readableReportText(value?: string | null) {
    return (value || '').replace(/_/g, ' ');
}

export function situationalTitle(value?: string | null) {
    return readableReportText(value).replace(/^\[SITUATIONAL\]\s*/i, '').trim() || 'Situational Report';
}

export function situationalStatus(report: { description: string | null; status: string | null; situation_status?: string | null }) {
    return readableReportText(report.situation_status || report.description?.match(/\[Field Status: ([^\]]+)\]/)?.[1] || report.status || 'Pending');
}

// Keep the relationship in the existing description field so deployed databases
// do not need a new column before reports can be linked across devices.
export function linkedReportId(description?: string | null) {
    return description?.match(/\[(?:Linked Situational Report|Linked Incident): ([0-9a-f-]{36})\]/i)?.[1] || null;
}

export function reportContext(description?: string | null) {
    return readableReportText((description || '')
        .replace(/\[(?:Linked Situational Report|Linked Incident|Attached Document|Field Status):[^\]]*\]/g, '')
        .trim());
}

export interface SituationalReport {
    report_id: string;
    parent_report_id: string | null;
    situation_status: string | null;
    situation_updated_at: string | null;
    report_type: string;
    hazard_type: string;
    description: string | null;
    status: string | null;
    created_at: string;
    image_url: string | null;
    latitude: number | null;
    longitude: number | null;
    reporter: { full_name: string; role: string; organization_name?: string | null } | null;
    place: { name: string } | null;
    municipality: { name: string } | null;
}
