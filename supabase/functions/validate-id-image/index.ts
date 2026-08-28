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
                    text: `You are an ID verification expert for FloodWatch Cebu, a Philippine government disaster monitoring app.

Your job is to verify if the submitted image is a real, valid Philippine government-issued ID.

The user selected document type: "${idType || 'Not specified'}"

Carefully examine the image and score it:

SCORING GUIDE for confidence_score (0 to 100):
- 95-100: Clearly a genuine Philippine gov ID, all text readable, photo visible, no tampering
- 85-94: Looks like a real ID but slightly blurry or partially obscured
- 70-84: Probably an ID but quality is poor or some details unclear  
- 50-69: Uncertain — could be an ID but too many issues
- 0-49: Not an ID, fake, screenshot, selfie, or unreadable

APPROVE only if confidence_score >= 90.
REJECT if confidence_score < 90.

Respond ONLY in this exact JSON format with no other text:
{
  "ai_is_valid": true or false,
  "confidence_score": integer from 0 to 100,
  "ai_insight": "one sentence describing what you see",
  "status": "approved" or "rejected"
}

Examples of what to REJECT:
- Selfies or photos of people without an ID
- Random objects, food, scenery
- Screenshots of an ID on a phone screen
- IDs that are too blurry to read
- Clearly fake or edited IDs

Examples of what to APPROVE:
- Clear photo of PhilSys ID, Driver's License, Passport, UMID, Voter's ID, PRC ID, etc.
- ID text is readable, photo on ID is visible
- All 4 corners of the ID are visible`,
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
          const parsed = JSON.parse(jsonMatch[0]);

          // Normalize confidence to 0-100 integer
          let confidence = parsed.confidence_score ?? parsed.ai_confidence_score ?? 0;
          if (confidence <= 1.0 && confidence > 0) confidence = Math.round(confidence * 100); // convert 0.0-1.0 to 0-100
          confidence = Math.round(confidence);

          // Enforce 90% threshold — auto reject if below
          const meetsThreshold = confidence >= 90;
          const finalStatus = meetsThreshold && parsed.ai_is_valid ? 'approved' : 'rejected';

          result = {
            ai_is_valid:         meetsThreshold && parsed.ai_is_valid,
            ai_confidence_score: confidence / 100, // store as 0.0-1.0 in DB
            ai_insight:          parsed.ai_insight || 'No insight provided.',
            status:              finalStatus,
          };

          console.log(`✅ ID validation via ${model}: confidence=${confidence}%, status=${finalStatus}`);
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
