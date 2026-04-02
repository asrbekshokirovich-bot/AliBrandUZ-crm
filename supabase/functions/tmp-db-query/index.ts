import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const client = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    const { data: q1, error: err1 } = await client
      .from('marketplace_orders')
      .select('ordered_at')
      .not('ordered_at', 'is', null)
      .order('ordered_at', { ascending: true })
      .limit(1);

    const { count: cUzum } = await client
      .from('marketplace_orders')
      .select('id', { count: 'exact', head: true })
      .eq('fulfillment_type', 'fbo') // Or just check total
      .gte('ordered_at', '2026-01-01');

    return new Response(JSON.stringify({ oldest: q1?.[0]?.ordered_at, uzumCount: cUzum, err1 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
