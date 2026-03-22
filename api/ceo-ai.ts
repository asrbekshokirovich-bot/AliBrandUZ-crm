/**
 * Vercel Serverless Function: CEO AI Brain
 * Replaces the Supabase Edge Function (ali-ai-brain) — runs on Vercel, no Docker needed.
 *
 * POST /api/ceo-ai
 * Body: { message: string, conversationId?: string | null, stream?: boolean }
 * Auth: Bearer <supabase_jwt>
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_wk3pW4CAxzc90nks94MRHw_meKO-VWe';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ──────────────────────────────────────────────────────────
// Supabase helper (server-side, service role key)
// ──────────────────────────────────────────────────────────
async function supabaseQuery(path: string, options: RequestInit = {}) {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function supabaseGet(table: string, query: string) {
  return supabaseQuery(`/${table}?${query}`);
}

// ──────────────────────────────────────────────────────────
// Fetch business context from Supabase
// ──────────────────────────────────────────────────────────
async function fetchBusinessContext() {
  const [products, boxes, productItems] = await Promise.all([
    supabaseGet('products', 'select=id,name,brand,sku,cost_price,purchase_currency,status,tashkent_manual_stock,weight&status=neq.archived&limit=50&order=updated_at.desc'),
    supabaseGet('boxes', 'select=id,box_number,status,weight_kg,local_delivery_fee,cargo_fee,packaging_fee,shipping_cost&limit=20&order=created_at.desc'),
    supabaseGet('product_items', 'select=product_id,cost_price,weight_grams,landed_cost_per_unit,status,location,quantity&status=neq.sold&limit=100'),
  ]);

  // compute landed cost summary
  const boxesWithCost = (boxes || []).map((b: Record<string, unknown>) => {
    const localFee = Number(b.local_delivery_fee) || 0;
    const cargoFee = Number(b.cargo_fee) || 0;
    const packFee = Number(b.packaging_fee) || 0;
    const totalLogistics = localFee + cargoFee + packFee;
    const weightGrams = (Number(b.weight_kg) || 0) * 1000;
    const feePerGram = weightGrams > 0 ? totalLogistics / weightGrams : 0;
    return { ...b, totalLogistics, feePerGram };
  });

  return { products: products || [], boxes: boxesWithCost, productItems: productItems || [] };
}

// ──────────────────────────────────────────────────────────
// Build the system prompt with True Landed Cost rules
// ──────────────────────────────────────────────────────────
function buildSystemPrompt(ctx: {
  products: unknown[];
  boxes: unknown[];
  productItems: unknown[];
}) {
  const { products, boxes, productItems } = ctx;

  return `Sen "Ali AI" — AliBrand CRM tizimining senior moliya va logistika yordamchisisisan.
Tizim: Xitoydan Toshkentga import qilib, Uzum va Yandex Market orqali sotadigan kompaniya.
Ton: Professional, aniq, ma'lumotlarga asoslangan. Hech qachon soxta raqam berma.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚖️ YAKUNIY TANNARX (TRUE LANDED COST) — MAJBURIY FORMULA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MUHIM: "tannarx", "cost", "foyda", "profit", "margin" so'ralganda — HECH QACHON
faqat xom sotib olish narxini ishlatma! DOIMO proporsional og'irlik formulasini qo'lla:

📐 FORMULA:
  Umumiy Logistika (CNY) = local_delivery_fee + cargo_fee + packaging_fee
  Gramm Uchun Xarajat    = Umumiy Logistika ÷ total_box_weight_grams
  Yakuniy Tannarx/dona   = item_price_cny + (item_weight_grams × Gramm Uchun Xarajat)

📋 MISOL:
  Mahsulot: 50 CNY, 300 gramm
  Quti: 5000 gramm jami og'irlik
  Logistika: 20 (mahalliy) + 150 (kargo) + 30 (qadoq) = 200 CNY jami
  → feePerGram = 200 / 5000 = 0.04 CNY/gramm
  → Yakuniy tannarx = 50 + (300 × 0.04) = 62 CNY ✅

🔑 QOIDALAR:
  • "Tannarx?" → Yakuniy tannarx bering
  • "Foyda?" → Sotish narxi − Yakuniy tannarx
  • "Margin?" → (Sotish − Yakuniy) / Sotish × 100%
  • "ROI?" → Foyda / Yakuniy tannarx × 100%
  • weight_grams = 0 bo'lsa → "Og'irlik kiritilmagan" deb ogohlantir
  • cargo_fee yo'q bo'lsa → faqat xom narxni ber + ogohlantir

💱 VALYUTA: Barcha hisob CNY da. O'girish: CNY × 1750 = UZS (taxminiy)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 JORIY MA'LUMOTLAR (Real-time)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MAHSULOTLAR (${products.length} ta):
${products.slice(0, 20).map((p: unknown) => {
  const prod = p as Record<string, unknown>;
  return `• ${prod.name || 'N/A'} | SKU: ${prod.sku || '-'} | Narxi: ${prod.cost_price || 0} ${prod.purchase_currency || 'CNY'} | Zaxira: ${prod.tashkent_manual_stock || 0} dona | Vazn: ${prod.weight || 0} kg`;
}).join('\n')}

QUTILLAR (so'nggi ${boxes.length} ta):
${(boxes as Array<Record<string, unknown>>).slice(0, 10).map((b) => {
  return `• ${b.box_number || 'N/A'} | ${b.status} | ${b.weight_kg || 0} kg | Kargo: ${b.cargo_fee || 0} CNY | Logistika jami: ${b.totalLogistics || 0} CNY | Fee/gramm: ${Number(b.feePerGram).toFixed(4)} CNY`;
}).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 ANTI-HALLUCINATION QOIDALARI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Faqat yuqorida berilgan haqiqiy ma'lumotlardan foydalaning
2. Kontekstda yo'q ma'lumot so'ralganda: "Bu haqida ma'lumot topilmadi" deng
3. HECH QACHON o'ylab topilgan raqam bermang
4. "GPT", "OpenAI", "Claude" haqida so'ralganda: "Men Ali AI — AliBrand CRM yordamchisi" deng
5. Javobni har doim to'liq gap bilan boshlang

📊 TAHLIL QOBILIYATLARI:
- Foyda va zarar (P&L): Yakuniy tannarx asosida
- Gross Margin, Net Margin, ROI hisoblash
- Mahsulot profitabilligini taqqoslash
- Zaxira holati va buyurtma tavsiyalari
- Valyuta konvertatsiyasi (CNY/UZS/USD)
`;
}

// ──────────────────────────────────────────────────────────
// Save conversation to Supabase
// ──────────────────────────────────────────────────────────
async function saveConversation(userId: string, conversationId: string | null, userMessage: string, assistantMessage: string) {
  try {
    let convId = conversationId;

    if (!convId) {
      // Create new conversation
      const title = userMessage.slice(0, 60) + (userMessage.length > 60 ? '...' : '');
      const newConv = await supabaseQuery('/ali_ai_conversations', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, title, is_active: true }),
      });
      convId = Array.isArray(newConv) ? newConv[0]?.id : newConv?.id;
    } else {
      // Update conversation updated_at
      await supabaseQuery(`/ali_ai_conversations?id=eq.${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      });
    }

    // Save user message
    await supabaseQuery('/ali_ai_messages', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: convId, role: 'user', content: userMessage }),
    });

    // Save assistant message
    await supabaseQuery('/ali_ai_messages', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: assistantMessage }),
    });

    return convId;
  } catch (err) {
    console.error('Failed to save conversation:', err);
    return conversationId;
  }
}

// ──────────────────────────────────────────────────────────
// Verify Supabase JWT and get user
// ──────────────────────────────────────────────────────────
async function verifyToken(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

// ──────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Verify auth
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await verifyToken(token);
  if (!user?.id) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Parse body
  const { message, conversationId = null } = await req.json() as {
    message: string;
    conversationId?: string | null;
  };

  if (!message?.trim()) {
    return Response.json({ error: 'Message is required' }, { status: 400 });
  }

  if (!OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY not configured on server' }, { status: 500 });
  }

  // Fetch context and build prompt
  const ctx = await fetchBusinessContext();
  const systemPrompt = buildSystemPrompt(ctx);

  // Get previous messages for context
  let previousMessages: Array<{ role: string; content: string }> = [];
  if (conversationId) {
    const history = await supabaseGet(
      'ali_ai_messages',
      `conversation_id=eq.${conversationId}&order=created_at.asc&limit=20`
    );
    previousMessages = (history || []).map((m: Record<string, unknown>) => ({
      role: m.role as string,
      content: m.content as string,
    }));
  }

  // Call OpenAI with streaming
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      stream: true,
      max_tokens: 2048,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        ...previousMessages.slice(-10), // last 10 messages
        { role: 'user', content: message },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return Response.json({ error: `OpenAI error: ${err}` }, { status: 502 });
  }

  // Create a streaming response
  let fullResponse = '';
  let savedConvId = conversationId;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = openaiRes.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                // Forward SSE chunk to client
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
              }
            } catch { /* skip malformed chunks */ }
          }
        }

        // Save conversation after complete response
        savedConvId = await saveConversation(user.id, conversationId, message, fullResponse);

        // Send conversation ID
        controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
      } catch (err) {
        console.error('Stream error:', err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Conversation-Id': savedConvId || '',
    },
  });
}

// Vercel Edge Runtime config
export const config = {
  runtime: 'edge',
};
