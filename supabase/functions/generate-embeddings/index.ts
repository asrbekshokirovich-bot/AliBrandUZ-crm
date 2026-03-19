import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { product_id, text_to_embed } = await req.json()

    if (!product_id || !text_to_embed) {
      throw new Error('product_id and text_to_embed are required')
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
       console.warn('No OPENAI_API_KEY set. Skipping embedding generation.')
       return new Response(JSON.stringify({ status: 'skipped', reason: 'No API key configuration' }), { headers: corsHeaders, status: 200 })
    }

    // Call OpenAI API for embeddings
    const openAiResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text_to_embed,
        model: 'text-embedding-3-small',
      })
    })

    if (!openAiResponse.ok) {
       const errorText = await openAiResponse.text()
       throw new Error(`OpenAI API error: ${errorText}`)
    }

    const embeddingData = await openAiResponse.json()
    const embedding = embeddingData.data[0].embedding

    // Update the product record in the database
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabaseClient
      .from('competitor_products')
      .update({ embedding })
      .eq('id', product_id)

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error(error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
