import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert Inventory & Financial Analytics AI for a multi-channel e-commerce company.

You have access to real-time inventory data. This data includes stock movements (kirim from China, transfers, sales, returns), stock levels per product/location, and revenue/profit-loss per platform.

The company sells on: Uzum, Yandex Market, Wildberries, and local stores. Fulfillment: FBS, FBO, DBS.

You will receive: a question from an admin (in Uzbek or Russian) + current inventory data as JSON.

Answer clearly, accurately, in the same language the question was asked.
Format numbers with thousands separators. Use UZS unless another currency is mentioned.
If data is insufficient, say so clearly. Be concise but complete.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { question } = body as { question: string };

    if (!question?.trim()) {
      return new Response(
        JSON.stringify({ error: "Question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Supabase REST API helper ────────────────────────────────────────
    const sbHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "apikey": SUPABASE_SERVICE_KEY,
    };

    // Fetch current stock (top 150 rows)
    const [stockRes, pnlRes, recentRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/inventory_stock?order=current_stock.desc&limit=150`, { headers: sbHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/inventory_pnl?order=month.desc&limit=100`, { headers: sbHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/inventory_transactions?select=transaction_type,product_name,sku,quantity,unit_price,total_price,platform,location_from,location_to,document_date,currency&order=created_at.desc&limit=50`, { headers: sbHeaders }),
    ]);

    const [stockData, pnlData, recentData] = await Promise.all([
      stockRes.ok ? stockRes.json() : [],
      pnlRes.ok ? pnlRes.json() : [],
      recentRes.ok ? recentRes.json() : [],
    ]);

    const context = {
      current_stock: stockData ?? [],
      pnl_by_store: pnlData ?? [],
      recent_transactions: recentData ?? [],
      data_as_of: new Date().toISOString(),
    };

    // ── Gemini API call ─────────────────────────────────────────────────
    const prompt = `${SYSTEM_PROMPT}

--- INVENTORY DATA ---
${JSON.stringify(context)}
--- END DATA ---

Admin question: ${question}

Answer:`;

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    const aiResp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`Gemini error ${aiResp.status}: ${errText.slice(0, 300)}`);
    }

    const aiData = await aiResp.json();
    const answer = aiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "AI javob bermadi.";

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("inventory-ai-query error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
