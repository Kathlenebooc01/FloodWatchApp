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

async function testInsert() {
    console.log("Fetching profiles...");
    const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,full_name&full_name=ilike.*Kathlene*`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const profiles = await profRes.json();
    console.log("Profiles:", profiles);
    if (!profiles || profiles.length === 0) return;
    const uid = profiles[0].id;

    console.log("Inserting notification...");
    const insRes = await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            user_id: uid,
            target_role: 'user',
            type: 'Updates',
            alert_type: 'approved',
            title: 'Test Request',
            message: 'This is a test.',
            is_read: false
        })
    });

    if (!insRes.ok) {
        console.error("INSERT FAILED:", await insRes.text());
    } else {
        console.log("INSERT SUCCESS:", await insRes.json());
    }
}

testInsert();
