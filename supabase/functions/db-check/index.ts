import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.3.3/mod.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const dbUrl = "postgres://postgres:skillhub1@gmailcom@db.ybtfepdqzbgmtlsiisvp.supabase.co:5432/postgres?sslmode=prefer";
  const sql = postgres(dbUrl);

  try {
    const counts = await sql`
      SELECT marketplace, count(*) 
      FROM public.marketplace_orders 
      GROUP BY marketplace
    `;
    
    return new Response(JSON.stringify({
      success: true,
      counts
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } finally {
    await sql.end();
  }
});
