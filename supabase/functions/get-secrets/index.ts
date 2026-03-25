import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  return new Response(JSON.stringify({
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    ENVIRONMENT: Deno.env.toObject()
  }), { headers: { 'Content-Type': 'application/json' } });
});
