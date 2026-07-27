import { supabase } from '@/utils/supabase';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function Index() {
    const router = useRouter();

    useEffect(() => {
        // Check if there is already an active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                // User is logged in — go straight to dashboard
                router.replace('/dashboard' as any);
            } else {
                // No session — go to login
                router.replace('/login' as any);
            }
        });
    }, []);

    return null;
}
