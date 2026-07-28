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
    const { phone, otp } = body;

    if (!phone || !otp) {
      return new Response(JSON.stringify({ error: 'Phone and OTP are required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get OTP record
    const { data: otpRecord, error: fetchError } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone', phone)
      .single();

    if (fetchError || !otpRecord) {
      return new Response(JSON.stringify({ error: 'OTP not found or expired.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if OTP matches
    if (otpRecord.otp !== otp) {
      return new Response(JSON.stringify({ error: 'Invalid OTP.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if OTP expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'OTP expired.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create or update user in auth
    const email = `${phone}@floodwatch.local`;
    const password = Math.random().toString(36).slice(-12); // Random password

    // Check if user exists
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const existingUser = users?.find(u => u.email === email);

    let userId = existingUser?.id;

    if (!existingUser) {
      // Create new user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: `Auth error: ${createError.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = newUser.user?.id;
    }

    // NOW SAVE PROFILE TO DATABASE (ON THE BACKEND)
    console.log('💾 Backend: Saving profile for user:', userId);
    const fullName = `${otpRecord.first_name || ''} ${otpRecord.last_name || ''}`.trim();
    
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        mobile_number: phone,
        full_name: fullName,
        role: 'citizen',
        is_verified: true,
        created_at: new Date().toISOString(),
      })
      .select();

    if (profileError) {
      console.error('❌ Backend profile insert failed:', profileError);
      console.error('Error code:', profileError.code);
      console.error('Error message:', profileError.message);
      // Continue anyway - don't fail the whole request
    } else {
      console.log('✅ Backend profile saved successfully!', profileData);
    }

    // Delete used OTP
    await supabase.from('otp_verifications').delete().eq('phone', phone);

    return new Response(JSON.stringify({
      success: true,
      email: email,
      password: password,
      firstName: otpRecord.first_name,
      lastName: otpRecord.last_name,
      userId: userId,
      profileSaved: !profileError,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
