// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
  const binaryString = atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, backBase64, imageUrl, idType, verificationId, userId } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Ensure front image is in Supabase Storage and we have a valid public URL
    let finalImageUrl = imageUrl || null;
    let base64Data = imageBase64 || '';

    // If imageUrl was passed without base64, fetch it server-side to get base64 for Gemini
    if (imageUrl && !base64Data) {
      try {
        console.log('📥 Fetching image from URL:', imageUrl);
        const imgResp = await fetch(imageUrl);
        if (imgResp.ok) {
          const arrayBuf = await imgResp.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuf);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
          }
          base64Data = btoa(binary);
          console.log(`✅ Fetched image from URL, length: ${base64Data.length}`);
        }
      } catch (fErr: any) {
        console.warn('⚠️ Failed to fetch imageUrl:', fErr.message);
      }
    }

    // If base64Data is available, ensure it is stored in Supabase storage so admin can view it
    if (base64Data) {
      try {
        const frontBytes = decodeBase64ToUint8Array(base64Data);
        const fileName = `id_front_${verificationId || Date.now()}_${Date.now()}.jpg`;
        const { error: upErr } = await supabase
          .storage
          .from('incident-reports')
          .upload(fileName, frontBytes, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!upErr) {
          const { data: pubData } = supabase
            .storage
            .from('incident-reports')
            .getPublicUrl(fileName);
          finalImageUrl = pubData.publicUrl;
          console.log('✅ Front image stored successfully:', finalImageUrl);
        } else {
          console.warn('⚠️ Supabase storage front upload error:', upErr.message);
        }
      } catch (upEx: any) {
        console.warn('⚠️ Server storage front upload exception:', upEx.message);
      }
    }

    // 2. Upload back image if provided
    let finalBackUrl: string | null = null;
    if (backBase64) {
      try {
        const backBytes = decodeBase64ToUint8Array(backBase64);
        const backFileName = `id_back_${verificationId || Date.now()}_${Date.now()}.jpg`;
        const { error: backUpErr } = await supabase
          .storage
          .from('incident-reports')
          .upload(backFileName, backBytes, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!backUpErr) {
          const { data: backPubData } = supabase
            .storage
            .from('incident-reports')
            .getPublicUrl(backFileName);
          finalBackUrl = backPubData.publicUrl;
          console.log('✅ Back image stored successfully:', finalBackUrl);
        } else {
          console.warn('⚠️ Supabase storage back upload error:', backUpErr.message);
        }
      } catch (backEx: any) {
        console.warn('⚠️ Server storage back upload exception:', backEx.message);
      }
    }

    // 3. Immediately persist image URLs to database so admin sees the photo right away
    if (verificationId && (finalImageUrl || finalBackUrl)) {
      const urlUpdate: any = {};
      if (finalImageUrl) urlUpdate.id_image_url = finalImageUrl;
      if (finalBackUrl)  urlUpdate.selfie_url   = finalBackUrl;
      const { error: urlErr } = await supabase
        .from('id_verification')
        .update(urlUpdate)
        .eq('id_verification_id', verificationId);

      if (urlErr) {
        console.warn('⚠️ Failed to update image URLs in id_verification:', urlErr.message);
      } else {
        console.log('✅ Updated id_verification with image URLs:', urlUpdate);
      }
    }

    if (!base64Data) {
      return new Response(JSON.stringify({
        error: 'No image provided or image could not be fetched',
        finalImageUrl,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const AI_API_ID = '4ac8efb6-5922-4be0-a1a7-8eff5887845f';

    let geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      try {
        const { data: apiRow } = await supabase
          .from('api_monitoring')
          .select('*')
          .eq('api_id', AI_API_ID)
          .maybeSingle();
        geminiApiKey = apiRow?.api_key || apiRow?.key || apiRow?.secret;
      } catch (keyErr: any) {
        console.warn('⚠️ Could not fetch key from api_monitoring:', keyErr.message);
      }
    }
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not set');

    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();

    // 4. Send to Gemini AI for identification and confidence analysis
    const models = ['gemini-3.6-flash'];
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
                      data: cleanBase64,
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
- Clear photo of PhilSys ID, Driver's License, Passport, UMID, Voter's ID, PRC ID, PhilSys Step 1 Slip, Barangay ID, etc.
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
          const errText = await resp.text();
          console.warn(`⚠️ ${model} failed with status ${resp.status}:`, errText);
          continue;
        }

        const data = await resp.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('🤖 Gemini raw response:', rawText);

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          let confidence = parsed.confidence_score ?? parsed.ai_confidence_score ?? 0;
          
          // Ensure confidence is between 0 and 100
          confidence = Math.max(0, Math.min(100, Math.round(confidence)));

          const meetsThreshold = confidence >= 90;
          const finalStatus = meetsThreshold && parsed.ai_is_valid ? 'approved' : 'rejected';

          result = {
            ai_is_valid:         meetsThreshold && parsed.ai_is_valid,
            ai_confidence_score: confidence, // store as integer 0-100
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

    if (!result) {
      result = {
        ai_is_valid: false,
        ai_confidence_score: 0,
        ai_insight: 'AI validation unavailable. Pending manual review.',
        status: 'pending',
      };
    }

    // 5. Update id_verification with AI analysis
    if (verificationId) {
      const updateData: any = {
        ai_is_valid:         result.ai_is_valid,
        ai_confidence_score: result.ai_confidence_score,
        ai_insight:          result.ai_insight,
        status:              result.status,
      };
      if (finalImageUrl) updateData.id_image_url = finalImageUrl;
      if (finalBackUrl)  updateData.selfie_url   = finalBackUrl;

      const { error: updateError } = await supabase
        .from('id_verification')
        .update(updateData)
        .eq('id_verification_id', verificationId);

      if (updateError) {
        console.error('❌ id_verification update failed:', updateError.message);
      } else {
        console.log('✅ id_verification updated:', result.status);

        // Fetch user_id if not supplied
        let targetUserId = userId;
        if (!targetUserId) {
          const { data: verRow } = await supabase
            .from('id_verification')
            .select('user_id')
            .eq('id_verification_id', verificationId)
            .maybeSingle();
          targetUserId = verRow?.user_id;
        }

        if (targetUserId) {
          if (result.status === 'approved') {
            await supabase
              .from('profiles')
              .update({ is_verified: true })
              .eq('id', targetUserId);
            console.log('✅ profiles.is_verified set to true for user:', targetUserId);
          }

          const title   = result.status === 'approved'
            ? '✅ ID Verification Complete'
            : '❌ ID Verification Failed';
          const message = result.status === 'approved'
            ? 'Your identity has been successfully verified. You can now submit flood incident reports.'
            : 'Your ID could not be verified. Please make sure your ID is clear, all corners are visible, and try again.';

          await supabase.from('notifications').insert({
            user_id:     targetUserId,
            title,
            message,
            type:        'Updates',
            is_read:     false,
            target_role: 'user',
            created_at:  new Date().toISOString(),
          });
          console.log('✅ Notification sent for ID verification status:', result.status);
        }
      }
    }

    // Update api_monitoring table for AI API tracking
    try {
      await supabase
        .from('api_monitoring')
        .update({
          api_status: result?.ai_confidence_score !== undefined ? 'active' : 'error',
          last_call_at: new Date().toISOString(),
          error_message: result?.ai_confidence_score !== undefined ? null : 'Failed to parse AI response',
        })
        .eq('api_id', AI_API_ID);
      console.log('✅ api_monitoring updated for AI ID:', AI_API_ID);
    } catch (monErr: any) {
      console.warn('⚠️ api_monitoring update error:', monErr.message);
    }

    return new Response(JSON.stringify({
      success:             true,
      ai_is_valid:         result.ai_is_valid,
      ai_confidence_score: result.ai_confidence_score,
      ai_insight:          result.ai_insight,
      status:              result.status,
      imageUrl:            finalImageUrl,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('❌ validate-id-image error:', err.message);

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase
        .from('api_monitoring')
        .update({
          api_status: 'error',
          last_call_at: new Date().toISOString(),
          error_message: err.message,
        })
        .eq('api_id', '4ac8efb6-5922-4be0-a1a7-8eff5887845f');
    } catch (_) {}

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
