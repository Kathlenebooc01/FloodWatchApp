import { supabase } from '@/utils/supabase';
import { SituationalReport } from '@/utils/situational-report';

export interface SituationalReportContext {
    report_id: string;
    title: string;
    current_status: string | null;
    latest_update_at: string | null;
}

export async function getSituationalReportContext(reportId: string) {
    const { data, error } = await supabase.rpc('get_situational_report_context', { p_report_id: reportId }).single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The selected main situational report is no longer available.');
    return data as SituationalReportContext;
}

export async function submitSituationalReport(input: {
    title: string; status: string; description: string; parentId: string | null;
    expectedStatus: string | null; documentPath: string | null;
}) {
    const { data, error } = await supabase.rpc('submit_situational_report', {
        p_title: input.title,
        p_status: input.status,
        p_description: input.description,
        p_parent_report_id: input.parentId,
        p_expected_status: input.expectedStatus,
        p_document_path: input.documentPath,
    }).single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The backend did not confirm that the report was saved.');
    return data as SituationalReport;
}
