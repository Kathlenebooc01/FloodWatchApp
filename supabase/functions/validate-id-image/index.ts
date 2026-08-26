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
    const { imageBase64, idType, verificationId } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not set');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Try main model, fallback to lite
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    let result: any = null;

    for (const model of models) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: imageBase64,
                    },
                  },
                  {
                    text: `You are an ID verification AI for FloodWatch Cebu, a disaster monitoring app in the Philippines.

Analyze this image and determine if it is a valid Philippine government-issued ID.

The user selected document type: "${idType || 'Not specified'}"

Check for:
1. Is this clearly a Philippine government ID (passport, driver's license, PhilSys, UMID, voter's ID, postal ID, PRC ID, etc.)?
2. Is the ID photo clearly visible and readable?
3. Does the ID look authentic (not a photo of a screen, not blurry, not cropped badly)?
4. Is the name and other text on the ID readable?

Respond ONLY in this exact JSON format:
{
  "ai_is_valid": true or false,
  "ai_confidence_score": 0.0 to 1.0,
  "ai_insight": "brief explanation in 1-2 sentences",
  "status": "approved" or "rejected"
}

Set ai_is_valid to false and status to rejected if:
- The image is NOT an ID (selfie, random photo, screenshot, etc.)
- The ID is too blurry or unreadable
- The ID appears fake or digitally altered
- It's a photo of a phone screen showing an ID

Set ai_is_valid to true and status to approved if it looks like a genuine, readable Philippine government ID.`,
                  },
                ],
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
            }),
          }
        );

        if (!resp.ok) {
          console.warn(`⚠️ ${model} failed:`, resp.status);
          continue;
        }

        const data = await resp.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('🤖 Gemini raw response:', rawText);

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
          console.log(`✅ ID validation via ${model}:`, result);
          break;
        }
      } catch (e: any) {
        console.warn(`⚠️ ${model} error:`, e.message);
        continue;
      }
    }

    // Default if AI fails
    if (!result) {
      result = {
        ai_is_valid: false,
        ai_confidence_score: 0,
        ai_insight: 'AI validation unavailable. Pending manual review.',
        status: 'pending',
      };
    }

    // Update id_verification record if verificationId provided
    if (verificationId) {
      const { error: updateError } = await supabase
        .from('id_verification')
        .update({
          ai_is_valid:        result.ai_is_valid,
          ai_confidence_score: result.ai_confidence_score,
          ai_insight:         result.ai_insight,
          status:             result.status,
        })
        .eq('id_verification_id', verificationId);

      if (updateError) {
        console.error('❌ Update failed:', updateError.message);
      } else {
        console.log('✅ id_verification updated:', result.status);

        // If approved, also update profiles.is_verified = true
        if (result.status === 'approved' || result.status === 'rejected') {
          const { data: verRow } = await supabase
            .from('id_verification')
            .select('user_id')
            .eq('id_verification_id', verificationId)
            .maybeSingle();

          if (verRow?.user_id) {
            // Update profile if approved
            if (result.status === 'approved') {
              await supabase
                .from('profiles')
                .update({ is_verified: true })
                .eq('id', verRow.user_id);
              console.log('✅ profiles.is_verified set to true for user:', verRow.user_id);
            }

            // Send notification to user
            const title   = result.status === 'approved'
              ? '✅ ID Verification Complete'
              : '❌ ID Verification Failed';
            const message = result.status === 'approved'
              ? 'Your identity has been successfully verified. You can now submit flood incident reports.'
              : 'Your ID could not be verified. Please make sure your ID is clear, all corners are visible, and try again.';

            await supabase.from('notifications').insert({
              user_id:     verRow.user_id,
              title,
              message,
              type:        'Updates',
              is_read:     false,
              target_role: 'user',
              created_at:  new Date().toISOString(),
            });
            console.log('✅ Notification sent for ID verification:', result.status);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success:             true,
      ai_is_valid:         result.ai_is_valid,
      ai_confidence_score: result.ai_confidence_score,
      ai_insight:          result.ai_insight,
      status:              result.status,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('❌ validate-id-image error:', err.message);
    return new Response(JSON.stringify({
      success:     false,
      error:       err.message,
      ai_is_valid: false,
      status:      'pending',
      ai_insight:  'AI validation failed. Pending manual review.',
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
