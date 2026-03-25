/**
 * Vercel Serverless Function: CEO AI Brain
 * Replaces the Supabase Edge Function (ali-ai-brain) — runs on Vercel, no Docker needed.
 *
 * POST /api/ceo-ai
 * Body: { message: string, conversationId?: string | null, stream?: boolean }
 * Auth: Bearer <supabase_jwt>
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_wc9DpbY-k9adrTmDysNrMw_RWWPK2fY';
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

async function supabaseGet(table: string, query: string, token?: string) {
  const options = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  return supabaseQuery(`/${table}?${query}`, options);
}

// ──────────────────────────────────────────────────────────
// Fetch business context from Supabase (enriched CEO data)
// ──────────────────────────────────────────────────────────
async function fetchBusinessContext(token: string) {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [products, boxes, productItems, todayOrders, weekFinance, tasks] = await Promise.all([
    supabaseGet('products', 'select=id,name,brand,sku,cost_price,purchase_currency,status,tashkent_manual_stock,weight&status=neq.archived&limit=50&order=updated_at.desc', token),
    supabaseGet('boxes', 'select=id,box_number,status,weight_kg,local_delivery_fee,cargo_fee,packaging_fee,created_at&limit=20&order=created_at.desc', token),
    supabaseGet('product_items', 'select=product_id,cost_price,weight_grams,landed_cost_per_unit,status,location,quantity&status=neq.sold&limit=100', token),
    supabaseGet('marketplace_orders', `select=platform,product_name,quantity,total_revenue,commission_fee&created_at=gte.${today}T00:00:00`, token),
    supabaseGet('finance_transactions', `select=transaction_type,amount,description&created_at=gte.${weekAgo}&limit=100`, token),
    supabaseGet('tasks', 'select=title,status,due_date,priority&status=in.(todo,in_progress)&limit=20', token),
  ]);

  const CNY_TO_UZS = 1750;

  // ── Box logistics pre-computation ──
  const boxesWithCost = (boxes || []).map((b: Record<string, unknown>) => {
    const localFee = Number(b.local_delivery_fee) || 0;
    const cargoFee = Number(b.cargo_fee) || 0;
    const packFee = Number(b.packaging_fee) || 0;
    const totalLogistics = localFee + cargoFee + packFee;
    const weightGrams = (Number(b.weight_kg) || 0) * 1000;
    const feePerGram = weightGrams > 0 ? totalLogistics / weightGrams : 0;
    const daysInTransit = b.status === 'in_transit'
      ? Math.floor((Date.now() - new Date(b.created_at as string).getTime()) / 86400000)
      : 0;
    return { ...b, totalLogistics, feePerGram, daysInTransit };
  });

  // ── Landed cost per product (calculateLandedCost formula) ──
  const bestBox = boxesWithCost.find((b: Record<string, unknown>) => (b.feePerGram as number) > 0);
  const defaultFeePerGram = (bestBox?.feePerGram as number) || 0;

  const productsWithAnalysis = (products || []).map((p: Record<string, unknown>) => {
    const priceCny = Number(p.cost_price) || 0;
    const weightGrams = (Number(p.weight) || 0) * 1000;
    const logisticsShareCny = weightGrams * defaultFeePerGram;
    const landedCostCny = priceCny + logisticsShareCny;
    const landedCostUzs = Math.round(landedCostCny * CNY_TO_UZS);
    const stock = Number(p.tashkent_manual_stock) ?? 0;
    return {
      name: p.name as string,
      sku: p.sku as string,
      priceCny,
      weightGrams,
      landedCostCny: Math.round(landedCostCny * 100) / 100,
      landedCostUzs,
      stock,
      isLowStock: stock > 0 && stock < 5,
      isOutOfStock: stock <= 0,
    };
  });

  // ── Today's sales ──
  const todaySales = todayOrders || [];
  const todayRevenue   = todaySales.reduce((s: number, o: Record<string, unknown>) => s + (Number(o.total_revenue) || 0), 0);
  const todayCommission = todaySales.reduce((s: number, o: Record<string, unknown>) => s + (Number(o.commission_fee) || 0), 0);

  // ── Week finance ──
  const wf = weekFinance || [];
  const weekIncome  = wf.filter((t: Record<string, unknown>) => t.transaction_type === 'income').reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
  const weekExpense = wf.filter((t: Record<string, unknown>) => t.transaction_type === 'expense').reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);

  // ── Auto-detect problems ──
  const problems: string[] = [];
  const outOfStock = productsWithAnalysis.filter((p: any) => p.isOutOfStock);
  const lowStock = productsWithAnalysis.filter((p: any) => p.isLowStock);
  const delayedBoxes = boxesWithCost.filter((b: Record<string, unknown>) => (b.daysInTransit as number) > 10);
  const allTasks = tasks || [];
  const overdueTasks = allTasks.filter((t: Record<string, unknown>) => t.due_date && new Date(t.due_date as string) < new Date());

  if (outOfStock.length)   problems.push(`🔴 ${outOfStock.length} ta mahsulot TUGADI (${outOfStock.slice(0,3).map((p: any) => p.name).join(', ')})`);
  if (lowStock.length)     problems.push(`⚠️ ${lowStock.length} ta mahsulot kam qoldi (<5 dona): ${lowStock.slice(0,3).map((p: any) => `${p.name} (${p.stock} dona)`).join(', ')}`);
  if (delayedBoxes.length) problems.push(`🕐 ${delayedBoxes.length} ta quti 10+ kun yo'lda — kechikish ehtimoli bor`);
  if (overdueTasks.length) problems.push(`📋 ${overdueTasks.length} ta vazifa muddati o'tib ketdi`);

  return {
    products: productsWithAnalysis,
    boxes: boxesWithCost,
    productItems: productItems || [],
    todayStats: { count: todaySales.length, revenue: todayRevenue, commission: todayCommission },
    weekFinance: { income: weekIncome, expense: weekExpense, net: weekIncome - weekExpense },
    problems,
    tasks: { total: allTasks.length, overdue: overdueTasks.length },
    defaultFeePerGram,
    CNY_TO_UZS,
  };
}

// ──────────────────────────────────────────────────────────
// Build CEO Intelligence System Prompt
// ──────────────────────────────────────────────────────────
function buildSystemPrompt(ctx: ReturnType<typeof fetchBusinessContext> extends Promise<infer T> ? T : never) {
  const { products, boxes, todayStats, weekFinance, problems, tasks, defaultFeePerGram, CNY_TO_UZS } = ctx;

  const problemsSection = problems.length > 0
    ? problems.map((p) => `  • ${p}`).join('\n')
    : '  • Hozircha aniq muammo aniqlanmadi';

  const topProducts = [...products]
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 15)
    .map((p) => `  • ${p.name} | SKU: ${p.sku || '-'} | Narx: ${p.priceCny} CNY | Tannarx: ${p.landedCostCny} CNY (${p.landedCostUzs.toLocaleString()} UZS) | Zaxira: ${p.stock} dona${p.isOutOfStock ? ' 🔴TUGADI' : p.isLowStock ? ' ⚠️KAM' : ''}`)
    .join('\n');

  const recentBoxes = (boxes as Array<Record<string, unknown>>).slice(0, 8)
    .map((b) => `  • ${b.box_number || 'N/A'} | ${b.status} | ${b.weight_kg || 0} kg | Logistika: ${(b.totalLogistics as number) || 0} CNY | Fee/g: ${Number(b.feePerGram).toFixed(4)} CNY${(b.daysInTransit as number) > 10 ? ` | ⏰ ${b.daysInTransit} kun yo'lda` : ''}`)
    .join('\n');

  return `Sen "Ali AI" — AliBrand CRM tizimining aqlli CEO yordamchisisisan.
Kompaniya: Xitoydan mahsulot import qilib, Uzum va Yandex Market orqali sotadi.

═══════════════════════════════════════════════
📊 BUGUNGI HOLAT (Real-time, ${new Date().toLocaleDateString('uz-UZ')})
═══════════════════════════════════════════════
• Bugungi buyurtmalar: ${todayStats.count} ta
• Bugungi daromad: ${todayStats.revenue.toLocaleString()} UZS
• Bugungi komissiya: ${todayStats.commission.toLocaleString()} UZS
• Sof daromad bugun: ~${(todayStats.revenue - todayStats.commission).toLocaleString()} UZS

• Haftalik kirim: ${weekFinance.income.toLocaleString()} UZS
• Haftalik chiqim: ${weekFinance.expense.toLocaleString()} UZS
• Haftalik sof: ${weekFinance.net.toLocaleString()} UZS

• Vazifalar jami: ${tasks.total} ta | Muddati o'tgan: ${tasks.overdue} ta

═══════════════════════════════════════════════
🚨 ANIQLAB OLINGAN MUAMMOLAR
═══════════════════════════════════════════════
${problemsSection}

═══════════════════════════════════════════════
📦 MAHSULOTLAR (${products.length} ta, tannarx hisoblangan)
═══════════════════════════════════════════════
${topProducts}

═══════════════════════════════════════════════
📬 QUTILLAR (so'nggi ${boxes.length} ta)
═══════════════════════════════════════════════
${recentBoxes}

═══════════════════════════════════════════════
⚖️ TANNARX FORMULASI (har doim ishlat)
═══════════════════════════════════════════════
fee_per_gram = ${defaultFeePerGram.toFixed(4)} CNY/gramm (joriy)
Tannarx = item_narxi_CNY + (og'irlik_gramm × fee_per_gram)
UZS = Tannarx_CNY × ${CNY_TO_UZS}

═══════════════════════════════════════════════
🧠 QOIDALAR
═══════════════════════════════════════════════
1. CEO INSIGHT FORMAT: Faqat raqam emas — sabab va tavsiya ham ber
   ❌ "10 ta sotildi"
   ✅ "10 ta sotildi. Sof foyda ~$X. [Mahsulot Y] margini past — narxni ko'rib chiq."

2. MUAMMO ANIQLASH: Savol "Qanday muammo bor?" bo'lsa — yuqoridagi muammolar ro'yxatini batafsil tushuntir

3. ZARAR ANIQLASH: "Qayerda zarar?" so'ralganda — landedCostUzs > sotish narxini solishtir, ⚠️ bilan belgi

4. UMUMIY SAVOLLARGA: Har qanday mavzuda suhbatlasha olasan (texnologiya, strategiya, marketing, hayot bo'yicha savollar va h.k.) — biznes ma'lumotlari bo'lmasa logikaga asoslanib javob ber

5. TIL: Savol qaysi tilda bo'lsa, shu tilda javob ber (o'zbek, rus, ingliz)

6. "GPT", "OpenAI" haqida so'ralsa: "Men Ali AI — AliBrand ning ongli yordamchisi" de
`;
}

// ──────────────────────────────────────────────────────────
// Create conversation (before streaming — so ID is in header)
// ──────────────────────────────────────────────────────────
async function createConversationIfNeeded(userId: string, conversationId: string | null, title: string): Promise<string | null> {
  if (conversationId) return conversationId;
  try {
    const newConv = await supabaseQuery('/ali_ai_conversations', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, title: title.slice(0, 60) + (title.length > 60 ? '...' : ''), is_active: true }),
    });
    return Array.isArray(newConv) ? newConv[0]?.id : newConv?.id || null;
  } catch (err) {
    console.error('Failed to create conversation:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// Save messages (after streaming is complete)
// ──────────────────────────────────────────────────────────
async function saveMessages(convId: string, userMessage: string, assistantMessage: string): Promise<void> {
  try {
    await Promise.all([
      supabaseQuery('/ali_ai_messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: convId, role: 'user', content: userMessage }),
      }),
      supabaseQuery('/ali_ai_messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: assistantMessage }),
      }),
      supabaseQuery(`/ali_ai_conversations?id=eq.${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      }),
    ]);
  } catch (err) {
    console.error('Failed to save messages:', err);
  }
}

// ──────────────────────────────────────────────────────────
// Verify Supabase JWT and get user (decode payload directly)
// ──────────────────────────────────────────────────────────
async function verifyToken(token: string) {
  try {
    // Supabase JWTs are standard JWTs: header.payload.signature (base64url encoded)
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode payload (base64url → base64 → JSON)
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));

    // Supabase JWTs must have sub (user ID) and be non-expired
    if (!payload.sub) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null; // expired

    return { id: payload.sub as string, email: payload.email as string, role: payload.role as string };
  } catch {
    return null;
  }
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
  const ctx = await fetchBusinessContext(token);
  const systemPrompt = buildSystemPrompt(ctx);

  // Get previous messages for context
  let previousMessages: Array<{ role: string; content: string }> = [];
  if (conversationId) {
    const history = await supabaseGet(
      'ali_ai_messages',
      `conversation_id=eq.${conversationId}&order=created_at.asc&limit=20`,
      token
    );
    previousMessages = (history || []).map((m: Record<string, unknown>) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content as string,
    }));
  }

  // Call OpenAI API with streaming
  const openaiRes = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...previousMessages.slice(-10),
          { role: 'user', content: message }
        ],
        stream: true,
        max_tokens: 2048,
        temperature: 0.3
      }),
    }
  );

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return Response.json({ error: `OpenAI error: ${err}` }, { status: 502 });
  }

  // ── Create conversation BEFORE streaming so the ID is available for the header ──
  const convId = await createConversationIfNeeded(user.id, conversationId, message);

  let fullResponse = '';

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
            if (!data || data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                // Forward perfectly matched OpenAI SSE chunk to client
                controller.enqueue(new TextEncoder().encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
                ));
              }
            } catch { /* skip malformed chunks */ }
          }
        }

        // Save user+assistant messages AFTER streaming completes
        if (convId && fullResponse) {
          await saveMessages(convId, message, fullResponse);
        }

        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
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
      'X-Conversation-Id': convId || '',  // ← Now correctly set BEFORE headers are sent
    },
  });
}

// Vercel Edge Runtime config
export const config = {
  runtime: 'edge',
};
