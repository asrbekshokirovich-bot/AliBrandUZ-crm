/**
 * Vercel Serverless Function: CEO AI Brain (Agentic Version)
 * Uses OpenAI Function Calling to dynamically answer questions.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_wc9DpbY-k9adrTmDysNrMw_RWWPK2fY';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_wk3pW4CAxzc90nks94MRHw_meKO-VWe';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ──────────────────────────────────────────────────────────
// Supabase helpers
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

async function verifyToken(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    if (!payload.sub) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: payload.sub as string, email: payload.email as string };
  } catch {
    return null;
  }
}

async function createConversationIfNeeded(userId: string, conversationId: string | null, title: string) {
  if (conversationId) return conversationId;
  try {
    const newConv = await supabaseQuery('/ali_ai_conversations', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, title: title.slice(0, 60), is_active: true }),
    });
    return Array.isArray(newConv) ? newConv[0]?.id : newConv?.id || null;
  } catch {
    return null;
  }
}

async function saveMessages(convId: string, userMessage: string, assistantMessage: string) {
  try {
    const now = new Date();
    const slightlyLater = new Date(now.getTime() + 1000); // offset to guarantee order
    
    await Promise.all([
      supabaseQuery('/ali_ai_messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: convId, role: 'user', content: userMessage, created_at: now.toISOString() }),
      }),
      supabaseQuery('/ali_ai_messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: convId, role: 'assistant', content: assistantMessage, created_at: slightlyLater.toISOString() }),
      }),
      supabaseQuery(`/ali_ai_conversations?id=eq.${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: slightlyLater.toISOString() }),
      }),
    ]);
  } catch (err) {
    console.error('Failed to save messages', err);
  }
}

// ──────────────────────────────────────────────────────────
// Agent Tools (Data Fetchers)
// ──────────────────────────────────────────────────────────
async function toolSearchProducts(args: any) {
  const query = args.query;
  // Search products by name or SKU
  const data = await supabaseQuery(`/products?select=id,name,sku,status,cost_price,warehouse_price,tashkent_manual_stock&or=(name.ilike.*${encodeURIComponent(query)}*,sku.ilike.*${encodeURIComponent(query)}*)&limit=15`);
  return { products_found: data || [] };
}

async function toolGetDashboardStats() {
  const today = new Date().toISOString().split('T')[0];
  const [orders, tasks, boxes] = await Promise.all([
    supabaseQuery(`/marketplace_orders?select=platform,total_revenue,commission_fee&created_at=gte.${today}T00:00:00`),
    supabaseQuery(`/tasks?select=id,title,status&status=in.(todo,in_progress)`),
    supabaseQuery(`/boxes?select=id,box_number,status&status=in.(in_transit,pending)&order=created_at.desc&limit=10`)
  ]);

  let total_revenue = 0;
  let total_commission = 0;
  (orders || []).forEach((o: any) => {
    total_revenue += Number(o.total_revenue) || 0;
    total_commission += Number(o.commission_fee) || 0;
  });

  return {
    today_orders_count: orders?.length || 0,
    today_revenue_uzs: total_revenue,
    today_commission_uzs: total_commission,
    open_tasks: tasks || [],
    recently_active_boxes: boxes || [],
  };
}

async function toolGetFinanceSummary(args: any) {
  const { start_date, end_date } = args;
  const start = start_date || new Date().toISOString().split('T')[0];
  const end = end_date || '2099-01-01';
  const data = await supabaseQuery(`/finance_transactions?select=transaction_type,amount,description&created_at=gte.${start}T00:00:00&created_at=lte.${end}T23:59:59&limit=50`);
  
  let income = 0;
  let expense = 0;
  (data || []).forEach((t: any) => {
    if (t.transaction_type === 'income') income += Number(t.amount);
    if (t.transaction_type === 'expense') expense += Number(t.amount);
  });

  return {
    period: `${start} dan ${end} gacha`,
    total_income_uzs: income,
    total_expense_uzs: expense,
    net_profit_uzs: income - expense,
    recent_transactions: (data || []).slice(0, 5)
  };
}

async function toolAnalyzeInventory() {
  const data = await supabaseQuery('/products?select=id,name,category_id,tashkent_manual_stock,avg_daily_sales,categories_hierarchy(name),product_variants(id,stock_quantity,variant_attributes)&status=eq.active');
  
  const smallKeywords = ['achki', 'ochki', "ko'zoynak", 'quloqchin', 'naushnik', 'kabel', 'chexol', 'aksessuar', 'soat', 'braslet', 'uzuk', 'sumka', 'kosmetika', 'atirlar', 'ruchka', 'paypoq', 'mayda', 'kichik'];
  const largeKeywords = ['noutbuk', 'kompyuter', 'televizor', 'muzlatgich', 'konditsioner', 'kir yuvish', 'velosiped', 'kalyaska', 'mebel', 'skuter', 'tv', 'monitor'];

  const lowStockItems: any[] = [];
  
  (data || []).forEach((product: any) => {
    if (product.source === 'marketplace_auto') return;
    const catName = product.categories_hierarchy?.name || '';
    const searchString = (product.name + " " + catName).toLowerCase();
    
    let threshold = 15;
    let type = 'standart';
    if (smallKeywords.some(k => searchString.includes(k))) { threshold = 50; type = 'mayda (small)'; }
    else if (largeKeywords.some(k => searchString.includes(k))) { threshold = 5; type = 'katta (large)'; }
    
    const variants = product.product_variants || [];
    const dailySales = product.avg_daily_sales || 0;
    
    if (variants.length > 0) {
      variants.forEach((v: any) => {
        const stock = v.stock_quantity || 0;
        if (stock <= threshold) {
          lowStockItems.push({
            name: `${product.name} (Variant: ${JSON.stringify(v.variant_attributes || {})})`,
            stock: stock,
            threshold: threshold,
            type: type,
            days_left: dailySales > 0 ? Math.floor(stock / dailySales) : 0
          });
        }
      });
    } else {
      const stock = product.tashkent_manual_stock || 0;
      if (stock <= threshold) {
        lowStockItems.push({
          name: product.name,
          stock: stock,
          threshold: threshold,
          type: type,
          days_left: dailySales > 0 ? Math.floor(stock / dailySales) : 0
        });
      }
    }
  });

  return {
    analysis_logic: "Thresholds: Mayda (50+), Katta (5+), Standart (15+).",
    critical_items_count: lowStockItems.length,
    critical_items: lowStockItems.sort((a, b) => a.stock - b.stock).slice(0, 30) // max 30 to save context
  };
}

async function toolGetMarketplaceSales(args: any) {
  const { start_date, end_date } = args;
  const start = start_date || new Date().toISOString().split('T')[0];
  const end = end_date || '2099-01-01';
  const data = await supabaseQuery(`/marketplace_orders?select=platform,total_amount,status,items&order_created_at=gte.${start}T00:00:00&order_created_at=lte.${end}T23:59:59&limit=500`);

  let total_sales = 0;
  const itemsSold: Record<string, { qty: number, price: number }> = {};
  
  (data || []).forEach((o: any) => {
    // Skip cancelled/returned orders if analyzing successful sales
    if (!o.status?.includes('CANCEL') && !o.status?.includes('RETURN')) { 
      total_sales += Number(o.total_amount) || 0;
      (o.items || []).forEach((item: any) => {
        const name = item.title || item.offerName || item.skuTitle || 'Unknown Product';
        const qty = item.quantity || item.count || 1;
        const price = item.price || 0;
        
        if (!itemsSold[name]) {
          itemsSold[name] = { qty: 0, price: price };
        }
        itemsSold[name].qty += qty;
      });
    }
  });

  const sortedItems = Object.entries(itemsSold)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 30) // top 30 to avoid token limits
    .map(([name, stats]) => `${name} (Sotildi: ${stats.qty} dona, Donasi: ${stats.price} UZS)`);

  return {
    period: `${start} dan ${end} gacha`,
    total_sales_revenue_uzs: total_sales,
    total_orders_count: data?.length || 0,
    top_sold_items: sortedItems.length > 0 ? sortedItems : ["Sotuvlar topilmadi yoki API dan sinxron qilinmagan"]
  };
}

// Map tool names to functions
const AVAILABLE_TOOLS: Record<string, (args: any) => Promise<any>> = {
  search_products: toolSearchProducts,
  get_dashboard_stats: toolGetDashboardStats,
  get_finance_summary: toolGetFinanceSummary,
  analyze_inventory: toolAnalyzeInventory,
  get_marketplace_sales: toolGetMarketplaceSales,
};

// Tool Definitions for OpenAI
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Qidiruv so'ziga ko'ra mahsulotlarni izlash va ularning bazadagi zaxirasi(stock), narxi va holati haqida ma'lumot olish. Agar so'rov aniq bir mahsulot haqida bo'lsa shuni ishlating.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Mahsulot nomi yoki SKU" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description: "Bugungi savdo ko'rsatkichlari, tushumlar, ochiq bo'lgan vazifalar va yo'ldagi qutilar haqida umumiy hisobot olish.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_finance_summary",
      description: "Ma'lum bir sanalar oralig'idagi umumiy moliya (tushum, komissiya, sof foyda) va oxirgi tranzaksiyalarni olish.",
      parameters: {
        type: "object",
        properties: { 
          start_date: { type: "string", description: "Boshlanish sanasi (masalan, 2026-03-01)" }, 
          end_date: { type: "string", description: "Tugash sanasi (masalan, 2026-03-31)" } 
        },
        required: ["start_date", "end_date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_inventory",
      description: "Tugab borayotgan mahsulotlarni intelligential (Katta va Mayda) toifalarga ajratib, analiz qilish. Har bir mahsulot necha kunga yetishi (days_left) va nechta qolganligini chiqarib beradi.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_marketplace_sales",
      description: "Berilgan aniq bir sana yoki sanalar oralig'idagi barcha Marketplace (Uzum, Yandex) sotuvlarini, tushgan umumiy summani va aynan nima tovarlar nechta sotilganini (TOP 30 ro'yxatini) batafsil olish. Agar foydalanuvchi 'kechagi', 'bugungi', yoki 'falon sanadagi sotuvlar/sotilgan narsalar ro'yxatini' so'rasa shu funksiyani ishlating.",
      parameters: {
        type: "object",
        properties: { 
          start_date: { type: "string", description: "Boshlanish sanasi (masalan, 2026-03-25)" }, 
          end_date: { type: "string", description: "Tugash sanasi (masalan, 2026-03-25)" } 
        },
        required: ["start_date", "end_date"]
      }
    }
  }
];

const GET_SYSTEM_PROMPT = (todayString: string, isoString: string) => `Sen "Ali AI" — AliBrand CRM tizimining aqlli CEO yordamchisisisan.
Sen bevosita ma'lumotlar bazasiga ulangan holda ishlaysan va savollarga javob berishda kerak bo'lsa funksiyalardan (Tools) foydalan!

MUHIM: Bugungi real sana — ${todayString} (ISO: ${isoString}). 
Juda Muhim: Agar foydalanuvchi "bugun", "shu oy", "hozirgi" deb so'rasa, faqat ${todayString} sanasiga nisbatan hisoblang! Eski yillarni (masalan 2023) qidirmang! Sizda ma'lumotlar bazasidan jonli (live) ma'lumot olish imkoniyati mavjud.

QOIDALAR:
1. Joriy holat, moliya, yoki mahsulotlar (masalan: qolgan zaxirasi yohud narxi) haqida so'rasa, to'g'ridan to'g'ri mos Tool'ni chaqir.
2. Zaxirasi tugayotgan tovarlar ("qolmayapti", "tugamoqda", "analiz") haqida so'ralganda 'analyze_inventory' dagi katta/mayda ekanligini ta'kidlab javob ber!
3. O'zbek, Rus va Ingliz tillarini ustasan. JAVOBLAR DOIM FORMATLANGAN SAVOL-JAVOB shaklida, chiroyli qisqa va aniq bo'lsin.
4. Keltirilgan barcha pul qoldiqlarini o'qishda osonlashtir (masalan: 12,000,000 so'm).
5. "Sen kimsan?" deb so'rashsa: "Men AliBrand tizimining aqlli CEO yordamchisi - Ali AI - man!" deb javob qaytar.
6. Muammo ko'rsang, darhol xabar ber va chorasini pichiqla.
7. QAT'IY QOIDA: Agar foydalanuvchi "sotuvlar ro'yxati", "nimalar sotildi", "sotuvlar" deb so'rasa 'get_marketplace_sales' qobiliyatini ishlat! Lekin "xarajatlar", "kassa", "moliya" deb so'rasa 'get_finance_summary' ni ishlat. Ikkalasini adashtirma!

TANNARX VA UMUMIY MATEMATIKA:
Joriy Xitoy > O'zbekiston valyuta kursi (CNY_TO_UZS): ~1750 UZS.
O'rtacha logistika taxminiy narxi (Xitoy-O'zbekiston): 1kg uchun ~35 CNY, ya'ni grammiga: 0.035 CNY tayanch.
Tannarx = item_narxi_CNY + (og'irlik_gramm × 0.035 CNY).
`;

// ──────────────────────────────────────────────────────────
// Main Export
// ──────────────────────────────────────────────────────────
export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await verifyToken(token);
  if (!user?.id) return Response.json({ error: 'Invalid token' }, { status: 401 });

  const { message, conversationId = null } = await req.json() as any;
  if (!message?.trim()) return Response.json({ error: 'Message required' }, { status: 400 });
  if (!OPENAI_API_KEY) return Response.json({ error: 'OPENAI_API_KEY is missing/invalid on server' }, { status: 500 });

  // Load history
  let previousMessages: any[] = [];
  if (conversationId) {
    const history = await supabaseQuery(`/ali_ai_messages?conversation_id=eq.${conversationId}&order=created_at.asc&limit=15`);
    previousMessages = (history || []).map((m: any) => ({
      role: m.role,
      content: m.content || '',
    })).filter((m: any) => m.content); // Prevent sending empty contents
  }

  const today = new Date();
  const todayString = today.toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  const messages = [
    { role: 'system', content: GET_SYSTEM_PROMPT(todayString, today.toISOString()) },
    ...previousMessages,
    { role: 'user', content: message }
  ];

  // STAGE 1: Non-streaming call to see if tools are needed
  const openaiRes1 = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
    }),
  });

  if (!openaiRes1.ok) {
    const err = await openaiRes1.text();
    return Response.json({ error: `OpenAI error: ${err}` }, { status: 502 });
  }

  const data1 = await openaiRes1.json();
  const choice = data1.choices?.[0]?.message;

  // Function to create fake SSE stream for pre-computed responses
  const streamDirectResponse = async (content: string, convId: string | null) => {
    if (convId && content) await saveMessages(convId, message, content);
    
    return new Response(new ReadableStream({
      start(controller) {
        // Enqueue the complete text as one chunk
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    }), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Conversation-Id': convId || '',
      },
    });
  };

  const convId = await createConversationIfNeeded(user.id, conversationId, message);

  // If AI did NOT call tools, it means choice.content has the direct answer
  if (!choice?.tool_calls?.length) {
    return await streamDirectResponse(choice.content || "Kechirasiz, javob topa olmadim.", convId);
  }

  // STAGE 2: If we get here, tools WERE called.
  messages.push(choice); // Push the assistant's request to use tools (vital for API schema)

  // Execute all requested tools
  for (const toolCall of choice.tool_calls) {
    const funcName = toolCall.function.name;
    let funcArgs = {};
    try {
      funcArgs = JSON.parse(toolCall.function.arguments || '{}');
    } catch { /* skip err */ }
    
    let resultData;
    if (AVAILABLE_TOOLS[funcName]) {
      try {
         resultData = await AVAILABLE_TOOLS[funcName](funcArgs);
      } catch (e: any) {
         resultData = { error: e.message };
      }
    } else {
      resultData = { error: 'Tool not implemented' };
    }

    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(resultData)
    });
  }

  // STAGE 3: Stream the final response matching the tool results back to the user
  const streamRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
    }),
  });

  if (!streamRes.ok) {
     const text = await streamRes.text();
     return streamDirectResponse(`Ulanishda xato yuz berdi. Iltimos keyinroq urinib ko'ring. (OpenAI API Error: ${streamRes.status} ${text})`, convId);
  }

  let fullContent = '';
  const stream = new ReadableStream({
    async start(controller) {
      const reader = streamRes.body!.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          textBuffer += decoder.decode(value, { stream: true });
          const lines = textBuffer.split('\n');
          textBuffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (let line of lines) {
            line = line.trim();
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || '';
              if (text) {
                fullContent += text;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
              }
            } catch { /* skip incomplete JSON that somehow made it as a full line */ }
          }
        }
        
        // Process remaining buffer
        if (textBuffer.trim()) {
          const lines = textBuffer.split('\n');
          for (let line of lines) {
            line = line.trim();
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || '';
              if (text) {
                fullContent += text;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
              }
            } catch {}
          }
        }
        
        if (convId && fullContent) await saveMessages(convId, message, fullContent);
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      } catch (err) {
        console.error('Stream error:', err);
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Conversation-Id': convId || '',
    },
  });
}

export const config = { runtime: 'edge' };
