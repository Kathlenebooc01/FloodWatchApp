
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
    const { imageUrl, imageBase64, reportId } = await req.json();

    // Get Gemini API key from database api_monitoring table
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }
    console.log('✅ Got API key');

    // Build image part - use base64 if provided, otherwise URL
    let imagePart: any;
    if (imageBase64) {
      imagePart = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64,
        },
      };
    } else if (imageUrl) {
      imagePart = {
        fileData: {
          mimeType: 'image/jpeg',
          fileUri: imageUrl,
        },
      };
    } else {
      throw new Error('No image provided');
    }

    // Try main model first, fallback to backup
    let geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              imagePart,
              {
                text: `You are an AI assistant for a flood monitoring app in Cebu, Philippines.

Analyze this image and determine if it shows a REAL disaster/hazard situation.

Valid hazard types include:
- Flooding or flood water
- Landslide or soil erosion  
- Fire or smoke
- Damaged infrastructure (roads, bridges, buildings)
- Fallen trees or debris
- Strong winds damage
- Any other natural or man-made disaster

Respond ONLY in this exact JSON format:
{
  "is_valid": true or false,
  "hazard_type": "Flood" or "Landslide" or "Fire" or "Infrastructure Damage" or "Debris" or "Other" or "None",
  "confidence": 0-100,
  "reason": "brief explanation"
}

If the image is NOT a hazard (e.g. selfie, food, random objects, clear weather, etc.), set is_valid to false.`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
          },
        }),
      }
    );

    // Fallback to backup model if main fails
    if (!geminiResponse.ok) {
      console.warn('⚠️ Main model failed, trying backup model...');
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                imagePart,
                {
                  text: `You are an AI assistant for a flood monitoring app in Cebu, Philippines.

Analyze this image and determine if it shows a REAL disaster/hazard situation.

Valid hazard types include:
- Flooding or flood water
- Landslide or soil erosion  
- Fire or smoke
- Damaged infrastructure (roads, bridges, buildings)
- Fallen trees or debris
- Strong winds damage
- Any other natural or man-made disaster

Respond ONLY in this exact JSON format:
{
  "is_valid": true or false,
  "hazard_type": "Flood" or "Landslide" or "Fire" or "Infrastructure Damage" or "Debris" or "Other" or "None",
  "confidence": 0-100,
  "reason": "brief explanation"
}

If the image is NOT a hazard (e.g. selfie, food, random objects, clear weather, etc.), set is_valid to false.`
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 200,
            },
          }),
        }
      );
    }

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('🤖 Gemini raw response:', rawText);

    // Parse JSON from response
    let result = { is_valid: false, hazard_type: 'None', confidence: 0, reason: 'Could not analyze image' };
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', parseErr);
    }

    console.log('✅ AI validation result:', result);

    // If reportId is provided, update the status in the database
    if (reportId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const newStatus = result.is_valid ? 'Pending' : 'Rejected';

      // Fetch report to get user_id and report_type
      const { data: reportRow } = await supabase
        .from('incident_report')
        .select('user_id, report_type, hazard_type')
        .eq('report_id', reportId)
        .maybeSingle();

      const { error: updateError } = await supabase
        .from('incident_report')
        .update({
          status: newStatus,
          hazard_type: result.hazard_type,
        })
        .eq('report_id', reportId);

      if (updateError) {
        console.error('❌ Status update failed:', updateError);
      } else {
        console.log(`✅ Status updated to: ${newStatus} for report ${reportId}`);
      }

      // ── Notify the user if rejected ──────────────────────────────────────
      if (newStatus === 'Rejected' && reportRow?.user_id) {
        const reportLabel = reportRow.report_type === 'quick_snap'
          ? 'Quick Snap Report'
          : reportRow.report_type === 'moderate_report'
            ? 'Moderate Report'
            : 'Report';

        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id:     reportRow.user_id,
            title:       `Your ${reportLabel} was not accepted`,
            message:     `We reviewed your ${reportLabel.toLowerCase()} and could not verify it as a valid flood or hazard incident. Reason: ${result.reason || 'Image does not show a hazard'}. Please submit a clearer photo if the situation is real.`,
            type:        'Updates',
            is_read:     false,
            target_role: 'user',
            created_at:  new Date().toISOString(),
          });

        if (notifError) {
          console.error('❌ Notification insert failed:', notifError);
        } else {
          console.log('✅ Rejection notification sent to user:', reportRow.user_id);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      is_valid: result.is_valid,
      hazard_type: result.hazard_type,
      confidence: result.confidence,
      reason: result.reason,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('❌ validate-report-image error:', err.message);
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      // Default to valid if AI fails - don't block user
      is_valid: true,
      hazard_type: 'Flood',
      confidence: 0,
      reason: 'AI validation unavailable',
    }), {
      status: 200, // Return 200 so app doesn't crash
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
