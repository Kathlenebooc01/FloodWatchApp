import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Looking for user Kathlene...");
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, role').ilike('full_name', '%Kathlene%');
    
    if (pErr) return console.error("Profiles error:", pErr);
    console.log("Profiles:", profiles);

    if (!profiles || profiles.length === 0) return;
    const uid = profiles[0].id;

    console.log(`\nFetching resource_requests for ${uid}...`);
    const { data: requests, error: rErr } = await supabase.from('resource_requests').select('request_id, status, created_at, requested_by').eq('requested_by', uid);
    
    if (rErr) return console.error("Requests error:", rErr);
    console.log("Requests count:", requests?.length);
    console.log("Requests:", requests);

    if (!requests || requests.length === 0) return;

    const requestIds = requests.map(r => r.request_id);
    console.log(`\nFetching resource_allocations for requests...`);
    const { data: allocs, error: aErr } = await supabase.from('resource_allocations').select('*').in('request_id', requestIds);
    
    if (aErr) return console.error("Allocations error:", aErr);
    console.log("Allocations:", allocs);
}

run();
