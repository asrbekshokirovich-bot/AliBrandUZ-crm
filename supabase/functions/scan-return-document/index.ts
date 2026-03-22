import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a professional Financial Controller, Accountant, and Warehouse Management AI for a multi-channel e-commerce company.

The company imports goods from China and sells via Uzum, Yandex Market, Wildberries, and local stores, using FBS/FBO/DBS fulfillment models.

##############################
### CRITICAL OUTPUT RULES
##############################
- Return ONLY valid JSON
- Use ONLY double quotes for ALL keys and values
- NEVER use single quotes
- Do NOT include explanations or text outside JSON
- Do NOT use markdown
- No trailing commas
- OUTPUT MUST BE COMPACT JSON - no newlines, no spaces between tokens
- Example: {"status":"success","classification":{...},"document":{...},"items":[...]}

If JSON is invalid → system will FAIL.

##############################
### STEP 1: CLASSIFICATION
##############################

Detect platform: china_supplier | uzum | yandex | wildberries | local_store
Detect logistics_model: FBS | FBO | DBS | warehouse_transfer
Detect document_type: kirim | transfer | sale | return | adjustment

##############################
### STEP 2: DATA EXTRACTION
##############################

Extract document fields: document_number, date, partner, warehouse_from, warehouse_to, currency
Extract items: product_name, sku (if visible), quantity, unit_price, total_price

##############################
### STEP 3: VALIDATION
##############################
- quantity > 0
- unit_price >= 0
- total_price = quantity × unit_price (correct if wrong)
- detect duplicates and missing fields

##############################
### STEP 4: INVENTORY EFFECT
##############################
IF kirim → addition to warehouse_to
IF transfer → deduction from warehouse_from, addition to warehouse_to
IF sale (FBS) → deduction from seller warehouse
IF sale (FBO) → deduction from marketplace warehouse
IF return → addition to corresponding warehouse

##############################
### STEP 5: FRAUD CHECK
##############################
Check: unusual prices, inconsistent totals, duplicate documents, abnormal quantities.
Assign risk_level: low | medium | high

##############################
### FINAL OUTPUT (STRICT JSON)
##############################

{"status":"success","classification":{"platform":"","logistics_model":"","document_type":""},"document":{"document_number":"","date":"","partner":"","warehouse_from":"","warehouse_to":"","currency":""},"items":[{"product_name":"","sku":"","quantity":0,"unit_price":0,"total_price":0}],"inventory_effect":{"deductions":[{"location":"","product_name":"","quantity":0}],"additions":[{"location":"","product_name":"","quantity":0}]},"summary":{"total_items":0,"total_value":0},"fraud_analysis":{"risk_level":"low","issues":[]},"warnings":[],"errors":[]}

FAIL SAFE (if cannot process):
{"status":"error","classification":{},"document":{},"items":[],"inventory_effect":{"deductions":[],"additions":[]},"summary":{"total_items":0,"total_value":0},"fraud_analysis":{"risk_level":"low","issues":[]},"warnings":[],"errors":["Invalid or unreadable document"]}

Self-check before returning: valid JSON, double quotes only, all required fields present, parseable.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { text, imageBase64, mimeType } = body as {
      text?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    if (!text && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "Either text or imageBase64 must be provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_MODEL = "gemini-2.0-flash";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    let parts: unknown[];

    if (imageBase64 && mimeType) {
      parts = [
        { text: SYSTEM_PROMPT },
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
      ];
    } else {
      const truncated = (text || "").slice(0, 12000);
      parts = [{ text: SYSTEM_PROMPT + "\n\nDocument text:\n" + truncated }];
    }

    const requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 8192,
      },
    };

    const aiResp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Gemini API error:", errText);
      throw new Error(`AI API error ${aiResp.status}: ${errText.slice(0, 300)}`);
    }

    const aiData = await aiResp.json();
    const rawContent: string = aiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    console.log("RAW:", rawContent.slice(0, 500));

    if (!rawContent) {
      return new Response(
        JSON.stringify({ error: "AI returned empty response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Robust JSON extraction
    let jsonStr = rawContent.trim();
    // Remove markdown code fences
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "");
    // If AI returned a JSON-stringified string (doubled escaping), unescape it
    if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
      try { jsonStr = JSON.parse(jsonStr); } catch { /* keep as-is */ }
    }
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Parse failed. Raw:", rawContent.slice(0, 500));
      return new Response(
        JSON.stringify({
          error: `JSON parse failed. AI said: ${rawContent.slice(0, 200)}`,
          status: "error",
          document: {},
          items: [],
          summary: { total_items: 0, total_value: 0 },
          errors: ["Could not parse AI response"],
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ...parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("scan-return-document error:", message);
    return new Response(
      JSON.stringify({ error: message, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
