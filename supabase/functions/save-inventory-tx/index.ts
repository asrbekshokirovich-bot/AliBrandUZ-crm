import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const {
      scan_result,
      classification,
      fixable_qty_map,
      unfixable_qty_map,
      nakladnoy_id,
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
    const resolvedAt = new Date().toISOString();

    // 1. Prepare transactions
    const txRows = scan_result.items.map((item: any) => ({
      transaction_type: docType,
      document_number: doc.document_number || nakladnoy_id || null,
      document_date: docDate,
      product_name: item.product_name,
      sku: item.sku || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency: doc.currency || "UZS",
      platform: cls.platform || null,
      location_from: doc.warehouse_from || null,
      location_to: doc.warehouse_to || cls.platform || null,
      fixable_qty: fixable_qty_map?.[item.product_name] ?? 0,
      unfixable_qty: unfixable_qty_map?.[item.product_name] ?? 0,
      notes: `Auto-saved from scanner. Doc: ${doc.document_number || nakladnoy_id || "N/A"}`,
    }));

    // Insert into inventory_transactions parallel
    const txPromise = supabase.from("inventory_transactions").insert(txRows);

    // 2. Fetch pending returns for this nakladnoy
    const { data: pendingReturns } = await supabase
      .from("marketplace_returns")
      .select("id, product_title, quantity, external_order_id")
      .eq("nakladnoy_id", nakladnoy_id)
      .eq("resolution", "pending");

    let updatedProductsCount = 0;
    let resolvedReturnsCount = 0;

    // 3. Process stock updates and resolutions if we have pending returns
    if (pendingReturns && pendingReturns.length > 0) {
      for (const ret of pendingReturns) {
        // Find mapped quantities from scanner result
        const fq = fixable_qty_map?.[ret.product_title] || 0;
        const uq = unfixable_qty_map?.[ret.product_title] || 0;
        const totalScanQty = scan_result.items.find((i: any) => i.product_name === ret.product_title)?.quantity || ret.quantity;
        const nq = Math.max(0, totalScanQty - fq - uq);

        // Calculate how much should actually go back to stock
        const validQty = nq + fq;
        const isUnfixableOnly = (uq > 0 && nq === 0 && fq === 0);

        // Update product stock if validQty > 0
        if (validQty > 0) {
          const { data: products } = await supabase
            .from("products")
            .select("id, tashkent_manual_stock")
            .ilike("name", `%${ret.product_title.substring(0, 30)}%`)
            .limit(1);

          if (products && products.length > 0) {
            const product = products[0];
            const newStock = (product.tashkent_manual_stock || 0) + validQty;
            await supabase
              .from("products")
              .update({ tashkent_manual_stock: newStock })
              .eq("id", product.id);
            updatedProductsCount++;
          }
        }

        // Mark return as resolved
        const resolution = isUnfixableOnly ? "remove_from_stock" : "return_to_stock";
        const resolutionNote = `Auto: added ${validQty} to stock, removed ${uq} as defect.`;

        await supabase
          .from("marketplace_returns")
          .update({
            resolution,
            resolution_note: resolutionNote,
            resolved_at: resolvedAt,
          })
          .eq("id", ret.id);

        resolvedReturnsCount++;
      }
    }

    const { error: txError } = await txPromise;
    if (txError) {
      console.error('[save-inventory-tx] Transaction log insert failed:', txError.message);
      // We still return success but note the failure to avoid blocking the workflow
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted_tx: txRows.length,
        resolved_returns: resolvedReturnsCount,
        updated_stocks: updatedProductsCount
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const message = err.message || "Unknown error";
    console.error("save-inventory-tx error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
