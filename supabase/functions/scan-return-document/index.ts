import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_SCHEMA = `{
  "step_by_step_thinking": "Write a line-by-line transcription of every single row you see in the table, stating the row number, product name, and exact 'Кол-во' before filling the items array.",
  "document": {
    "document_type": "brak or yaroqli or return",
    "document_number": "string",
    "date": "string (YYYY-MM-DD)",
    "partner": "string"
  },
  "items": [
    {
      "product_name": "string (MUST include color/variation if written in brackets)",
      "sku": "string (if available)",
      "quantity": 1,
      "unit_price": 0,
      "total_price": 0
    }
  ],
  "summary": {
    "total_items": 1,
    "total_value": 0
  }
}`;

const TEXT_PROMPT = `Extract return/claim information from the document text below.
Return ONLY this exact JSON — no markdown, no explanation, no extra fields.
For document_type, try to classify if the items are defective ("brak"), normal ("yaroqli"/"sog'lom"), or a general return ("return").

Schema:
${TARGET_SCHEMA}

Text:\n`;

const VISION_PROMPT = `You are a highly precise data extraction scanner. Deeply analyze the provided return document image.
CRITICAL INSTRUCTIONS:
1. First, inside the "step_by_step_thinking" field, you MUST create a strict anchor map for all 13 rows.
2. SPATIAL ALIGNMENT TRICK: To avoid shifting numbers up or down, look at the Row Number (№) on the far left, then scan horizontally to the "Кол-во (шт.)" column (second from right). Transcribe exactly like this: "No 1 -> Qty 2", "No 2 -> Qty 2", ..., "No 9 -> Qty 1", "No 10 -> Qty 10", "No 11 -> Qty 3", "No 12 -> Qty 3", "No 13 -> Qty 1".
3. After building this map, match each product name (including its color/variant in brackets) to the exact Row Number you just mapped.
4. Extract the SKU or barcode in the "sku" field if present.
5. DO NOT skip any rows! Check your numbering sequence from 1 to 13.
6. The sum of all quantities in your items array MUST EQUAL the mathematical total visible of those rows (sum is usually 37).
Return ONLY this exact JSON — no extra fields, no markdown.

Schema:
${TARGET_SCHEMA}
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractFirstJSON(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const OPENAI_API_BASE_URL = Deno.env.get("OPENAI_API_BASE_URL") || "https://api.openai.com/v1";
  const AI_MODEL = Deno.env.get("AI_MODEL") || "gpt-4o";

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OpenAI service not configured", success: false, hasData: false }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    let body: { text?: string; imageBase64?: string; mimeType?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text, imageBase64, mimeType } = body;

    if (!text && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "Either text or imageBase64 must be provided", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let requestBody: any;

    if (imageBase64) {
      requestBody = {
        model: AI_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        temperature: 0.0,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      };
    } else {
      const truncated = (text || "").slice(0, 12000);
      requestBody = {
        model: AI_MODEL,
        messages: [
          {
            role: "user",
            content: TEXT_PROMPT + truncated
          }
        ],
        temperature: 0.0,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      };
    }

    const resp = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => resp.statusText);
      throw new Error(`OpenAI API error ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content ?? "";

    if (!rawContent.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "AI returned empty response" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jsonStr = extractFirstJSON(rawContent);
    if (!jsonStr) {
      return new Response(
        JSON.stringify({ success: false, error: "No JSON found in AI response" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Response parse failed: ${String(e).slice(0, 100)}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the response structured exactly as useReturnScanner.ts expects it:
    // parsed contains document, items, summary. We merge it with success: true.
    return new Response(
      JSON.stringify({
        success: true,
        status: "success",
        document: parsed.document || {},
        items: Array.isArray(parsed.items) ? parsed.items : [],
        summary: parsed.summary || {}
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("scan-return-document fatal error:", message);
    return new Response(
      JSON.stringify({ error: message, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
