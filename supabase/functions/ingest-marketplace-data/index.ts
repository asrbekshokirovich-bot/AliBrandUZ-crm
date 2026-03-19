import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ScrapedProduct {
  marketplace: string;
  external_id: string;
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  url?: string;
  image_url?: string;
  metadata?: Record<string, any>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload: ScrapedProduct = await req.json()
    
    // Insert into database
    const { data: product, error } = await supabaseClient
      .from('competitor_products')
      .upsert({
        marketplace: payload.marketplace,
        external_id: payload.external_id,
        title: payload.title,
        description: payload.description,
        price: payload.price,
        currency: payload.currency || 'UZS',
        url: payload.url,
        image_url: payload.image_url,
        metadata: payload.metadata || {}
      }, { onConflict: 'marketplace, external_id' })
      .select()
      .single()

    if (error) throw error

    // Call generate-embeddings function asynchronously
    // This allows the ingestion API to return immediately to the scraper
    supabaseClient.functions.invoke('generate-embeddings', {
      body: { product_id: product.id, text_to_embed: `${payload.title} ${payload.description || ''}` }
    })

    return new Response(JSON.stringify({ success: true, product }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
