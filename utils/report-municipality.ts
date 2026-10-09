import { supabase } from './supabase';

/** Resolve the municipality of the reported incident; an ambiguous place stays unassigned. */
export async function resolveReportMunicipality(city?: string | null): Promise<string | null> {
    const name = city?.trim();
    if (!name) return null;

    const { data, error } = await supabase
        .from('municipality_or_city')
        .select('municipality_id, name')
        .ilike('name', name)
        .limit(2);
    if (error) throw error;
    return data?.length === 1 ? data[0].municipality_id : null;
}
