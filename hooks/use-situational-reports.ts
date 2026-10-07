import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/utils/supabase';
import { LGU_REPORT_ROLES, SITUATIONAL_REPORT_FILTER, SituationalReport } from '@/utils/situational-report';

export function useSituationalReports() {
    const [reports, setReports] = useState<SituationalReport[]>([]);
    const [linkCounts, setLinkCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const mounted = useRef(false);
    const running = useRef(false);
    const queued = useRef(false);

    const reload = useCallback(async () => {
        if (running.current) { queued.current = true; return; }
        running.current = true;
        try {
            do {
                queued.current = false;
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError || !user) throw new Error('An LGU account is required.');
                const actor = await supabase.from('profiles').select('municipality_id').eq('id', user.id).single();
                if (actor.error || !actor.data?.municipality_id) throw new Error('An LGU municipality is required.');
                const result = await
                    supabase.from('incident_report')
                        .select('*, reporter:profiles!user_id!inner(full_name, role, organization_name), place:specific_locations!fk_incident_report_specific_location(name), municipality:municipality_or_city!municipality_id(name)')
                        .or(SITUATIONAL_REPORT_FILTER)
                        .in('reporter.role', LGU_REPORT_ROLES)
                        .eq('municipality_id', actor.data.municipality_id)
                        .order('created_at', { ascending: false });
                if (result.error) throw result.error;
                if (!mounted.current) return;
                const counts: Record<string, number> = {};
                for (const row of result.data || []) {
                    const id = row.parent_report_id;
                    if (id) counts[id] = (counts[id] || 0) + 1;
                }
                setReports((result.data as unknown as SituationalReport[]).filter(report => !report.parent_report_id && report.status === 'Verified'));
                setLinkCounts(counts);
                setError('');
                setLoading(false);
            } while (queued.current && mounted.current);
        } catch {
            if (mounted.current) {
                setError('Could not load the latest LGU situational reports. Please try again.');
                setLoading(false);
            }
        } finally {
            running.current = false;
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        // Subscribe before the initial read to avoid missing an intervening insert.
        const channel = supabase.channel(`situational-report-links-${Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_report' }, () => { void reload(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void reload(); })
            .subscribe((state) => { if (state === 'SUBSCRIBED') void reload(); });
        const initialLoad = setTimeout(() => { void reload(); }, 0);
        // Automatic reconciliation also covers reconnects and deployments where
        // the table is not yet included in the Realtime publication.
        const timer = setInterval(() => { if (AppState.currentState === 'active') void reload(); }, 10000);
        const listener = AppState.addEventListener('change', state => { if (state === 'active') void reload(); });
        return () => {
            mounted.current = false;
            clearTimeout(initialLoad);
            clearInterval(timer);
            listener.remove();
            void supabase.removeChannel(channel);
        };
    }, [reload]);

    return { reports, linkCounts, loading, error, reload };
}
