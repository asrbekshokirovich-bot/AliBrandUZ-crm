import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const client = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    // Velina Uzum -> Ali brand women shoes (shop_id: 88411)
    const res1 = await client.from('marketplace_stores')
      .update({ name: 'Ali brand women shoes', shop_id: '88411', api_key_secret_name: 'UZUM_API_KEY_88411' })
      .eq('name', 'Velina Uzum');

    // Atlas Market -> (shop_id: 69508)
    const res2 = await client.from('marketplace_stores')
      .update({ shop_id: '69508', api_key_secret_name: 'UZUM_API_KEY_69508' })
      .in('name', ['Atlas Market', 'Atlas.Market'])
      .eq('shop_id', '316698'); // Only update the wrongly configured ones
      
    // AliBrand.Market
    const res3 = await client.from('marketplace_stores')
      .update({ api_key_secret_name: 'UZUM_API_KEY_92815' })
      .in('shop_id', ['92815']);
      
    // Uzum China Market
    const res4 = await client.from('marketplace_stores')
      .update({ api_key_secret_name: 'UZUM_API_KEY_69555' })
      .in('shop_id', ['69555']);

    // BM Store
    const res5 = await client.from('marketplace_stores')
      .update({ api_key_secret_name: 'UZUM_API_KEY_89165' })
      .in('shop_id', ['89165']);

    // BM_store
    const res6 = await client.from('marketplace_stores')
      .update({ api_key_secret_name: 'UZUM_API_KEY_92638' })
      .in('shop_id', ['92638']);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
