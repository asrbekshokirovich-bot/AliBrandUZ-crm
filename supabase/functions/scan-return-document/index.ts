import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_SCHEMA = `{
  "product_name": "",
  "order_id": "",
  "price": "",
  "reason_for_return": "",
  "date": ""
}`;

const TEXT_PROMPT = `Extract return/claim information from the document text below.
Return ONLY this exact JSON — no markdown, no explanation, no extra fields:
${TARGET_SCHEMA}

Rules:
- Leave field as "" if not found
- price = digits only, no currency symbols (e.g. "25.50")
- date = YYYY-MM-DD if possible
- order_id = any document number, order number, or invoice number
- product_name = name of the returned product or item

Text:
`;

const VISION_PROMPT = `You are a return document scanner. Examine this document and extract return information.
Return ONLY this exact JSON — no markdown, no explanation, no extra fields:
${TARGET_SCHEMA}

Rules:
- Leave field as "" if not found
- price = digits only, no currency symbols (e.g. "25.50")
- date = YYYY-MM-DD if possible
- order_id = any document number, order number, or nakladnoy number you see
- product_name = name of the returned product or item`;

// ── JSON extraction helpers ───────────────────────────────────────────────────

function extractFirstJSON(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

/** Try to extract our 5 target fields from ANY JSON structure (flat or nested) */
function extractTargetFields(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {
    product_name: "",
    order_id: "",
    price: "",
    reason_for_return: "",
    date: "",
  };

  // Field aliases — map common alternative key names to our target keys
  const aliases: Record<string, string> = {
    product_name: "product_name",
    product: "product_name",
    item: "product_name",
    tovar: "product_name",
    mahsulot: "product_name",
    goods: "product_name",
    name: "product_name",
    title: "product_name",

    order_id: "order_id",
    order: "order_id",
    order_number: "order_id",
    document_number: "order_id",
    nakladnoy: "order_id",
    invoice_number: "order_id",
    ref: "order_id",
    id: "order_id",
    number: "order_id",

    price: "price",
    amount: "price",
    sum: "price",
    total: "price",
    cost: "price",
    summa: "price",
    narx: "price",

    reason_for_return: "reason_for_return",
    reason: "reason_for_return",
    return_reason: "reason_for_return",
    sabab: "reason_for_return",
    note: "reason_for_return",
    comment: "reason_for_return",
    description: "reason_for_return",

    date: "date",
    return_date: "date",
    created_at: "date",
    sana: "date",
    created: "date",
  };

  // Recursively flatten the object, picking up aliased fields
  function flatten(o: Record<string, unknown>, depth = 0) {
    if (depth > 3) return; // Don't go too deep
    for (const [key, val] of Object.entries(o)) {
      const lower = key.toLowerCase().replace(/[^a-z_]/g, "_");
      const target = aliases[lower];
      if (target && !result[target] && val !== null && val !== undefined) {
        result[target] = String(val).trim();
      }
      // Also recurse into nested objects
      if (val && typeof val === "object" && !Array.isArray(val)) {
        flatten(val as Record<string, unknown>, depth + 1);
      }
    }
  }

  flatten(obj);

  // Clean price — keep digits and decimal only
  if (result.price) {
    result.price = result.price.replace(/[^0-9.]/g, "");
  }

  return result;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI service not configured", success: false, hasData: false }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    let body: { text?: string; imageBase64?: string; mimeType?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body", success: false, hasData: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text, imageBase64, mimeType } = body;

    if (!text && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "Either text or imageBase64 must be provided", success: false, hasData: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isPDF = mimeType === "application/pdf";
    const isImage = mimeType?.startsWith("image/") ?? false;

    let requestBody: Record<string, unknown>;

    if (imageBase64) {
      // Vision mode for both images and PDFs
      requestBody = {
        model: "google/gemini-2.0-flash-exp",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${isPDF ? "application/pdf" : (mimeType || "image/jpeg")};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 600,
        temperature: 0.05,
      };
    } else {
      // Text mode for DOCX / XLSX extracted text
      const truncated = (text || "").slice(0, 12000);
      requestBody = {
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "user", content: TEXT_PROMPT + truncated },
        ],
        max_tokens: 600,
        temperature: 0.05,
      };
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => aiResp.statusText);
      throw new Error(`AI API error ${aiResp.status}: ${errText.slice(0, 200)}`);
    }

    const aiData = await aiResp.json();
    const rawContent: string = aiData.choices?.[0]?.message?.content ?? "";

    if (!rawContent.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "AI returned empty response", extracted: null, hasData: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract JSON from the response (handle markdown fences, plain text, etc.)
    const jsonStr = extractFirstJSON(rawContent);
    if (!jsonStr) {
      return new Response(
        JSON.stringify({ success: false, error: "No JSON found in AI response", extracted: null, hasData: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("JSON.parse failed, raw:", rawContent.slice(0, 300));
      return new Response(
        JSON.stringify({
          success: false,
          error: `Response parse failed: ${String(parseErr).slice(0, 100)}`,
          extracted: null,
          hasData: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract target fields from ANY JSON structure (flat or nested)
    const extracted = extractTargetFields(parsed);
    const hasData = Object.values(extracted).some((v) => v.trim() !== "");

    return new Response(
      JSON.stringify({ success: true, extracted, hasData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("scan-return-document fatal error:", message);
    return new Response(
      JSON.stringify({ error: message, success: false, extracted: null, hasData: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
