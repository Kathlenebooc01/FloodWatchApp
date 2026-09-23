import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envFile = fs.readFileSync(envPath, 'utf8');

const parseEnv = (content: string) => {
    const lines = content.split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
        const [key, ...values] = line.split('=');
        if (key && values.length > 0) {
            result[key.trim()] = values.join('=').trim().replace(/['"]/g, '');
        }
    }
    return result;
};

const env = parseEnv(envFile);
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function checkDB() {
    console.log("Fetching requests...");
    const reqRes = await fetch(`${supabaseUrl}/rest/v1/resource_requests?select=request_id,status,created_at&order=created_at.desc&limit=10`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const reqs = await reqRes.json();
    console.log("Recent Requests:", reqs);

    console.log("Fetching allocations...");
    const allocRes = await fetch(`${supabaseUrl}/rest/v1/resource_allocations?select=*&order=created_at.desc&limit=10`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const allocs = await allocRes.json();
    console.log("Recent Allocations:", allocs);
}

checkDB();
