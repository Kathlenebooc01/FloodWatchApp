import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CEBU_MUNICIPALITIES = [
  'Cebu City', 'Lapu-Lapu City', 'Mandaue City', 'Talisay City',
  'Naga City', 'Toledo City', 'Carcar City', 'Danao City', 'Bogo City',
  'Alcantara', 'Alcoy', 'Alegria', 'Aloguinsan', 'Argao', 'Asturias',
  'Badian', 'Balamban', 'Bantayan', 'Barili', 'Boljoon', 'Borbon',
  'Carmen', 'Catmon', 'Compostela', 'Consolacion', 'Cordova',
  'Daanbantayan', 'Dalaguete', 'Dumanjug', 'Ginatilan', 'Liloan',
  'Madridejos', 'Malabuyoc', 'Medellin', 'Minglanilla', 'Moalboal',
  'Oslob', 'Pilar', 'Pinamungajan', 'Poro', 'Ronda', 'Samboan',
  'San Fernando', 'San Francisco', 'San Remigio', 'Santa Fe',
  'Santander', 'Sibonga', 'Sogod', 'Tabogon', 'Tabuelan', 'Tuburan', 'Tudela',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    // ── Step 1: Seed province table ──────────────────────────────────────
    let provinceId: string | null = null;

    const { data: existingProv } = await supabase
      .from('province')
      .select('province_id, name')
      .ilike('name', '%Cebu%')
      .limit(1)
      .maybeSingle();

    if (existingProv) {
      provinceId = existingProv.province_id;
      console.log('Province already exists:', provinceId);
    } else {
      const { data: newProv, error: provError } = await supabase
        .from('province')
        .insert({ name: 'Cebu', updated_at: new Date().toISOString() })
        .select('province_id')
        .single();

      if (provError) throw new Error('Province insert failed: ' + provError.message);
      provinceId = newProv.province_id;
      console.log('Province inserted:', provinceId);
    }

    // ── Step 2: Seed municipality_or_city ────────────────────────────────
    const { data: existingMuns } = await supabase
      .from('municipality_or_city')
      .select('municipality_id, name');

    if (!force && existingMuns && existingMuns.length >= 10) {
      return new Response(JSON.stringify({
        message: 'Already seeded',
        province_id: provinceId,
        municipality_count: existingMuns.length,
        sample: existingMuns.slice(0, 5),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Only insert municipalities that don't exist yet
    const existingNames = new Set((existingMuns || []).map((m: any) => m.name.toLowerCase()));
    const toInsert = CEBU_MUNICIPALITIES
      .filter(name => !existingNames.has(name.toLowerCase()))
      .map(name => ({
        name,
        province_id: provinceId,
        updated_at: new Date().toISOString(),
      }));

    if (toInsert.length === 0) {
      return new Response(JSON.stringify({
        message: 'All municipalities already exist',
        count: existingMuns?.length,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: inserted, error: munError } = await supabase
      .from('municipality_or_city')
      .insert(toInsert)
      .select('municipality_id, name');

    if (munError) throw new Error('Municipality insert failed: ' + munError.message);

    return new Response(JSON.stringify({
      success: true,
      province_id: provinceId,
      inserted: inserted?.length,
      municipalities: inserted,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Seed error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
