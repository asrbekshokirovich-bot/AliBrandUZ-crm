import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      scan_result,
      classification,
      fixable_qty_map,
      unfixable_qty_map,
    } = body;

    if (!scan_result?.items?.length) {
      return new Response(
        JSON.stringify({ error: "No items to save" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const doc = scan_result.document ?? {};
    const cls = classification ?? scan_result.classification ?? {};
    const docType = cls.document_type || doc.document_type || "kirim";
    const docDate = doc.date ? new Date(doc.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    const rows = scan_result.items.map((item: {
      product_name: string;
      sku?: string;
      quantity: number;
      unit_price: number;
    }) => ({
      transaction_type: docType,
      document_number:  doc.document_number || null,
      document_date:    docDate,
      product_name:     item.product_name,
      sku:              item.sku || null,
      quantity:         item.quantity,
      unit_price:       item.unit_price,
      currency:         doc.currency || "UZS",
      platform:         cls.platform || null,
      logistics_model:  cls.logistics_model || null,
      location_from:    doc.warehouse_from || null,
      location_to:      doc.warehouse_to || cls.platform || null,
      fixable_qty:      fixable_qty_map?.[item.product_name] ?? 0,
      unfixable_qty:    unfixable_qty_map?.[item.product_name] ?? 0,
      notes: `Auto-saved from scanner. Doc: ${doc.document_number || "N/A"}`,
    }));

    const response = await fetch(`${SUPABASE_URL}/rest/v1/inventory_transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "apikey": SUPABASE_SERVICE_KEY,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DB insert failed ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({ success: true, inserted: Array.isArray(data) ? data.length : rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("save-inventory-tx error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
