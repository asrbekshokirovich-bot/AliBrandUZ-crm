import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    const { data: stores, error } = await client
      .from('marketplace_stores')
      .select('*')
      .eq('platform', 'uzum')
      .limit(1);
    
    if (error) throw error;
    return new Response(JSON.stringify({ uzum_sample: stores[0] || "No Uzum stores found" }));
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
