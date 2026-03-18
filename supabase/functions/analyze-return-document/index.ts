import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Accept either base64 image data or a URL
    const { imageBase64, imageUrl, mimeType = 'image/jpeg' } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 or imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the image content part
    const imageContent = imageBase64
      ? {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        }
      : {
          type: 'image_url',
          image_url: { url: imageUrl },
        };

    // ─── STEP 1: Check document clarity ───────────────────────────────────────
    const clarityPrompt = `Sen hujjat sifatini tekshiruvchi ekspertsan.
Bu hujjat rasmini ko'rib, quyidagilarni aniqliqcha baholasang:
1. Hujjat o'qish uchun yetarli darajada aniq va tiniqmi? (clarity_score: 0.0 - 1.0)
2. Harf va raqamlar o'qiladimi?
3. Jadval satrlari ko'rinadimi?

Faqat JSON formatida javob ber:
{
  "clarity_score": 0.85,
  "is_readable": true,
  "clarity_issues": ""
}

Agar clarity_score 0.6 dan past bo'lsa, is_readable = false deb belgilasang va clarity_issues ga muammoni yozsan.`;

    const clarityResponse = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: clarityPrompt },
              imageContent,
            ],
          },
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });

    if (!clarityResponse.ok) {
      const errText = await clarityResponse.text();
      console.error('Clarity check failed:', errText);
      return new Response(
        JSON.stringify({ error: 'AI service error during clarity check' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clarityData = await clarityResponse.json();
    const clarityContent = clarityData.choices?.[0]?.message?.content || '{}';
    
    let clarityResult = { clarity_score: 0.8, is_readable: true, clarity_issues: '' };
    try {
      const jsonMatch = clarityContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) clarityResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Could not parse clarity JSON:', e);
    }

    // If document is not readable, return early with warning
    if (!clarityResult.is_readable || clarityResult.clarity_score < 0.55) {
      return new Response(
        JSON.stringify({
          success: true,
          is_readable: false,
          clarity_score: clarityResult.clarity_score,
          clarity_issues: clarityResult.clarity_issues || 'Hujjat xira yoki o\'qish qiyin',
          items: [],
          document_info: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── STEP 2: Extract items from the document ──────────────────────────────
    const extractPrompt = `Sen "Возврат товаров комитенту" (Tovarlarni qaytarish) hujjati analizatorisan.
Bu hujjat rasmidan quyidagi ma'lumotlarni JSON sifatida chiqar:

1. document_info: hujjat raqami, sanasi, mijoz nomi, komissioner
2. items: jadvaldan BARCHA tovar qatorlarini ajrat

Har bir tovar qatori uchun:
- num: tartib raqami (№)
- sku: SKU товара (mahsulot kodi)
- name: Описание товара (mahsulot nomi)  
- barcode: Штрих-код (bor bo'lsa, yo'q bo'lsa null)
- price: Закупочная цена (sotib olish narxi, son)
- qty: Кол-во (миqdori, son)
- total: Сумма (jami, son)

Faqat JSON formatida javob ber, boshqa matn yo'q:
{
  "document_info": {
    "doc_number": "6640907",
    "date": "2026-02-09",
    "client_name": "Yunusova Umida Anvarovna",
    "client_phone": "998977472336",
    "contract_number": "0326698н",
    "commissioner": "ИП ООО UZUM MARKET"
  },
  "items": [
    {
      "num": 1,
      "sku": "ABDU98-ATR-АМЕТИС",
      "name": "Atir uchun flakon, sprey-purkagich, 5 ml (Rang: Ametis)",
      "barcode": "1000055280762",
      "price": 9900,
      "qty": 2,
      "total": 19800
    }
  ],
  "grand_total_qty": 233,
  "grand_total_sum": 14845200
}`;

    const extractResponse = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: extractPrompt },
              imageContent,
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.05,
      }),
    });

    if (!extractResponse.ok) {
      const errText = await extractResponse.text();
      console.error('Extract failed:', errText);
      return new Response(
        JSON.stringify({ error: 'AI service error during item extraction' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractData = await extractResponse.json();
    const extractContent = extractData.choices?.[0]?.message?.content || '{}';

    let extractResult: any = { document_info: null, items: [] };
    try {
      const jsonMatch = extractContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) extractResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Could not parse extract JSON:', e);
      return new Response(
        JSON.stringify({ error: 'Could not parse document items. Please try again.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_readable: true,
        clarity_score: clarityResult.clarity_score,
        document_info: extractResult.document_info || null,
        items: extractResult.items || [],
        grand_total_qty: extractResult.grand_total_qty || null,
        grand_total_sum: extractResult.grand_total_sum || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in analyze-return-document:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
