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
    supabaseQuery(`/boxes?select=id,box_number,status&status=in.(in_transit,pending)&limit=10`)
  ]);

  let total_revenue = 0;
  let total_commission = 0;
  (orders || []).forEach((o: any) => {
    total_revenue += Number(o.total_revenue) || 0;
    total_commission += Number(o.commission_fee) || 0;
  });

  return {
    today_orders_count: orders?.length || 0,
    today_revenue: total_revenue,
    today_commission: total_commission,
    open_tasks: tasks || [],
    active_boxes: boxes || [],
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
    total_income: income,
    total_expense: expense,
    net_profit: income - expense,
    recent_transactions: (data || []).slice(0, 10)
  };
}

// Map tool names to functions
const AVAILABLE_TOOLS: Record<string, (args: any) => Promise<any>> = {
  search_products: toolSearchProducts,
  get_dashboard_stats: toolGetDashboardStats,
  get_finance_summary: toolGetFinanceSummary,
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
      description: "Bugungi savdo ko'rsatkichlari, tushumlar, ochiq vazifalar va yo'ldagi qutilar haqida umumiy hisobot olish.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_finance_summary",
      description: "Ma'lum bir vaqt oralig'i uchun moliyaviy statistikani (tushum, komissiya, foyda) va tranzaksiyalarni olish. Sana formati: YYYY-MM-DD",
      parameters: {
        type: "object",
        properties: { 
          start_date: { type: "string", description: "Boshlanish sanasi (masalan, 2026-03-01)" }, 
          end_date: { type: "string", description: "Tugash sanasi (masalan, 2026-03-31)" } 
        },
        required: ["start_date", "end_date"]
      }
    }
  }
];

const SYSTEM_PROMPT = `Sen "Ali AI" — AliBrand CRM tizimining aqlli CEO yordamchisisisan.
Sen endi bevosita ma'lumotlar bazasiga ulangan holda ishlaysan so'rovnomalarni bajarish funksiyalaridan (Tools) foydalanib eng aniq javoblarni taqdim eta olasan.
QOIDALAR:
1. Agar mijoz mahsulot zaxirasi, qutilar, statistika yoki moliya haqida so'rasa, to'g'ridan-to'g'ri o'ylab o'tirmasdan tegishli "Tool"ni chaqirib aniq javob qaytar!
2. O'zbek, Rus va Ingliz tillarini tushunasan. Muzokara qaysi tilda bo'lsa, shu tilda davom et.
3. Keltirilgan barcha pul qoldiqlarini o'qishda vizual qulaylik yarat (masalan: 12,000,000 so'm).
4. O'zingni "Men Ali AI — AliBrand tizimi yordamchisi" deb tanishtir agar so'rashsa.
5. Agar bironta ochiq muammo aniqlasang, foydalanuvchiga muammoning yechimi haqida o'z maslahatingni ber.`;

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
  if (!OPENAI_API_KEY) return Response.json({ error: 'OPENAI_API_KEY is missing' }, { status: 500 });

  // Load history
  let previousMessages: any[] = [];
  if (conversationId) {
    const history = await supabaseQuery(`/ali_ai_messages?conversation_id=eq.${conversationId}&order=created_at.asc&limit=15`);
    previousMessages = (history || []).map((m: any) => ({
      role: m.role,
      content: m.content || '',
    }));
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
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

  // If AI decides to call tools
  if (choice?.tool_calls?.length > 0) {
    messages.push(choice); // Push the assistant's tool_call request

    // Execute all tool calls
    for (const toolCall of choice.tool_calls) {
      const funcName = toolCall.function.name;
      const funcArgs = JSON.parse(toolCall.function.arguments || '{}');
      
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
  } else {
    // If no tools were called, we still want to stream the response!
    // But since we just got the full text, we can just pseudo-stream it or make the second call.
    // Making a second call with `stream: true` using exactly the same messages is easiest conceptually.
  }

  // Ensure conversation exists to send in headers
  const convId = await createConversationIfNeeded(user.id, conversationId, message);

  // STAGE 2: Stream final response to user
  const streamRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages, // This now includes tool_calls and tool results if they happened
      stream: true,
    }),
  });

  let fullContent = '';
  const stream = new ReadableStream({
    async start(controller) {
      const reader = streamRes.body!.getReader();
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
              const text = parsed.choices?.[0]?.delta?.content || '';
              if (text) {
                fullContent += text;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
              }
            } catch { /* skip */ }
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
