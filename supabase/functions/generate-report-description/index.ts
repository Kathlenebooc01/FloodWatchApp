
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not set');

    // Try main model, fallback to lite
    const models = ['gemini-3.6-flash', 'gemini-2.5-flash-lite'];
    let description = '';
    let lastError = '';

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
                  { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                  { text: `You are helping a citizen report a disaster in Cebu, Philippines.

Look at this image and write a clear, factual incident description in 2-3 sentences.

Requirements:
- Describe exactly what you see (flood depth, damage, debris, road condition, etc.)
- Mention visible details like water level, affected area, or severity
- Use simple, direct language a local emergency responder would understand
- Do NOT mention AI, image analysis, or that this is automated
- Write as if the citizen is personally reporting what they observed
- Keep it under 70 words

Write the description only, no intro, no labels.` },
                ],
              }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
            }),
          }
        );

        if (!resp.ok) {
          const errText = await resp.text();
          console.warn(`⚠️ ${model} failed (${resp.status}):`, errText.slice(0, 300));
          lastError = `${model}(${resp.status}): ${errText.slice(0, 150)}`;
          continue;
        }

        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          description = text;
          console.log(`✅ Description generated via ${model}`);
          break;
        }
      } catch (modelErr: any) {
        console.warn(`⚠️ ${model} error:`, modelErr.message);
        lastError = `${model}: ${modelErr.message}`;
        continue;
      }
    }

    if (!description) {
      return new Response(JSON.stringify({ description: null, error: 'AI unavailable', lastError }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ description }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('❌ generate-report-description error:', err.message);
    return new Response(JSON.stringify({ description: null, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
