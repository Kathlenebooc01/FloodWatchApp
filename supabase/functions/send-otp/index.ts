import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { phone, firstName, lastName } = body;

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone number is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('otp_verifications').delete().eq('phone', phone);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from('otp_verifications').insert({
      phone,
      otp,
      expires_at: expiresAt,
      first_name: firstName || '',
      last_name: lastName || '',
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: `DB error: ${insertError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TEST MODE ONLY - Always show OTP on screen (no SMS)
    console.log('🧪 TEST MODE ONLY - OTP:', otp);
    
    return new Response(JSON.stringify({
      success: true,
      test_mode: true,
      test_otp: otp,
      message: 'Test mode - use the code shown on screen.'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
