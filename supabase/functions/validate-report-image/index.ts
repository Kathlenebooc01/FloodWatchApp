// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const moderateIncidentExpectations: Record<string, string> = {
  'Severe Flooding': 'significant floodwater or heavily flooded surroundings',
  'Flash Flood': 'rapid flooding or visible flash-flood conditions; a still photo may show the resulting floodwater',
  'Flooded Road': 'a road or street affected by floodwater',
  'Flooded Residential Area': 'floodwater affecting houses or residential surroundings',
  'Rising Water Level': 'visible elevated or rising water affecting an area; a still photo need not prove movement',
  'Drainage Overflow': 'overflowing drainage, canals, or drainage-related flooding',
  'Flood Debris / Blockage': 'debris or blockage associated with flooding or drainage',
  'Bridge / Road Submerged': 'a bridge or road visibly submerged or covered by floodwater',
};

async function checkModerateIncidentImage(imagePart: unknown, incidentType: string, geminiApiKey: string, backupApiKey: string) {
  const prompt = `Check whether this actual photo reasonably relates to the selected Cebu flood incident: ${incidentType}. Expected evidence: ${moderateIncidentExpectations[incidentType]}. Related flooding evidence can match even when a still photo cannot prove timing or water movement. Be conservative: mark unrelated only when the image is clearly unrelated (such as a selfie, food, or unrelated scenery). If unclear, obscured, or uncertain, choose uncertain. Return JSON only: {"decision":"match|unrelated|uncertain","confidence":0-100,"reason":"short explanation"}.`;
  const body = JSON.stringify({ contents: [{ parts: [imagePart, { text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 250, responseMimeType: 'application/json' } });
  for (const [model, apiKey] of [['gemini-3.6-flash', geminiApiKey], ['gemini-2.5-flash-lite', backupApiKey]]) {
    if (!apiKey) continue;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(12000) });
      if (!response.ok) {
        console.warn(`Moderate image check ${model} returned HTTP ${response.status}`);
        continue;
      }
      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text || '';
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const confidence = Number(parsed.confidence);
      const decision = parsed.decision === 'unrelated' && confidence >= 85 ? 'unrelated'
        : parsed.decision === 'match' && confidence >= 60 ? 'match' : 'uncertain';
      return { success: true, decision, confidence: Number.isFinite(confidence) ? confidence : 0,
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : '' };
    } catch (error) { console.warn(`Moderate image check ${model} failed:`, error instanceof Error ? error.name : 'request error'); }
  }
  return { success: false, decision: 'uncertain', confidence: 0, error_code: 'ai_unavailable',
    reason: 'The AI image check is temporarily unavailable. Retry or submit for manual review.' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageUrl, imageBase64, reportId, selectedIncidentType, validationScope } = await req.json();

    // Get Gemini API key from database api_monitoring table
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      const AI_API_ID = '4ac8efb6-5922-4be0-a1a7-8eff5887845f';
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

    const backupGeminiApiKey = Deno.env.get('GEMINI_API_KEY_BACKUP') || Deno.env.get('EXPO_PUBLIC_GEMINI_LANTAW_BACKUP_AI') || '';
    if (!geminiApiKey && !(validationScope === 'moderate_incident_image' && backupGeminiApiKey)) {
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

    // Pre-submit check only for Moderate Report. No report record is changed here.
    if (validationScope === 'moderate_incident_image' && !reportId) {
      if (!Object.prototype.hasOwnProperty.call(moderateIncidentExpectations, selectedIncidentType)) {
        return new Response(JSON.stringify({ success: false, decision: 'uncertain', reason: 'Select an incident type first.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const decision = await checkModerateIncidentImage(imagePart, selectedIncidentType,
        geminiApiKey || backupGeminiApiKey, backupGeminiApiKey || geminiApiKey);
      return new Response(JSON.stringify(decision),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Try main model first, fallback to backup
    let geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
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
      console.warn('⚠️ Main model failed, trying backup model gemini-1.5-flash...');
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
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
      console.error('❌ Both models failed. Gemini API error:', errText);
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
        .eq('report_id', reportId)
        .in('status', ['Pending', 'Pending_AI']);

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
            user_id: reportRow.user_id,
            title: `Your ${reportLabel} was not accepted`,
            message: `We reviewed your ${reportLabel.toLowerCase()} and could not verify it as a valid flood or hazard incident. Reason: ${result.reason || 'Image does not show a hazard'}. Please submit a clearer photo if the situation is real.`,
            type: 'Updates',
            is_read: false,
            target_role: 'user',
            created_at: new Date().toISOString(),
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
