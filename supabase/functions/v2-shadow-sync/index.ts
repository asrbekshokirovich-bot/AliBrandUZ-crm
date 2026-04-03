import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const { data: stores } = await supabase.from("v2_marketplaces").select("*").eq("is_active", true);
    if (!stores || stores.length === 0) {
      return new Response(JSON.stringify({ stores_processed: 0, success_count: 0, error_log: [] }), { 
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    let success_count = 0;
    const error_log: string[] = [];

    for (const store of stores) {
      try {
        const apiKey = Deno.env.get(store.api_key_secret_name || "");
        if (!apiKey) throw new Error("Missing API Key");

        let ordersToUpsert: any[] = [];

        if (store.platform === "uzum" && store.external_shop_id) {
          const dateFromMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
          const origUrl = `https://api.business.uzum.uz/api/v1/orders?shopIds=${store.external_shop_id}&size=100&dateFrom=${dateFromMs}`;
          const url = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(origUrl)}`;
          let data: any = {};
          
          let rawText = "";
          try {
            const resp = await fetch(url, {
              headers: { 
                "Authorization": apiKey.startsWith("Bearer") ? apiKey : `Bearer ${apiKey}`,
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0"
              }
            });
            rawText = await resp.text();
            if (!resp.ok) {
              error_log.push(`[${store.name || "Uzum"}] HTTP ${resp.status}. Raw: ${rawText.substring(0, 300)}`);
              throw new Error(`HTTP ${resp.status}`);
            }
            
            let actualContent = rawText;
            try { data = JSON.parse(actualContent); } catch (e) {
              error_log.push(`[${store.name || "Uzum"}] JSON Error. Raw: ${actualContent.substring(0, 300)}`);
            }
          } catch (e) {
            const errStr = String(e);
            if (errStr.toLowerCase().includes("certificate")) {
              error_log.push(`[${store.name || "Uzum"}] SSL Bypass: ${errStr}`);
              continue;
            }
            if (!error_log.some(log => log.includes(errStr) && log.includes(store.name || "Uzum"))) {
               throw new Error(`Fetch failed: ${errStr}`);
            } else {
               continue;
            }
          }

          if (data && "error" in data) throw new Error(String(data?.error));
          const payload = data?.payload?.orders || data?.payload || [];
          
          ordersToUpsert = Array.isArray(payload) ? payload.map((o: any) => ({
            marketplace_id: store.id,
            external_order_id: String(o.id),
            ordered_at: o.createTime || new Date().toISOString(),
            normalized_status: String(o.status || "").toUpperCase() === "DELIVERED" ? "delivered" : "pending",
            gross_amount: o.totalAmount || 0,
            currency: "UZS"
          })) : [];
        } else if (store.platform === "yandex" && store.campaign_id) {
          const url = `https://api.partner.market.yandex.ru/campaigns/${store.campaign_id}/orders?pageSize=50`;
          let data: any = {};

          let rawText = "";

          try {
            const resp = await fetch(url, {
              headers: { 
                "Authorization": apiKey.startsWith("Bearer") || apiKey.startsWith("OAuth") ? apiKey : `Bearer ${apiKey}`,
                "Accept": "application/json"
              }
            });
            rawText = await resp.text();
            if (!resp.ok) {
              error_log.push(`[${store.name || "Yandex"}] HTTP ${resp.status}. Raw: ${rawText.substring(0, 300)}`);
              throw new Error(`HTTP ${resp.status}`);
            }
            try { data = JSON.parse(rawText); } catch (e) {
               error_log.push(`[${store.name || "Yandex"}] JSON Error. Raw: ${rawText.substring(0, 300)}`);
            }
          } catch (e) {
            const errStr = String(e);
            if (errStr.toLowerCase().includes("certificate")) {
              error_log.push(`[${store.name || "Yandex"}] SSL Bypass: ${errStr}`);
              continue;
            }
            if (!error_log.some(log => log.includes(errStr) && log.includes(store.name || "Yandex"))) {
               throw new Error(`Fetch failed: ${errStr}`);
            } else {
               continue;
            }
          }

          if (data && "error" in data) throw new Error(String(data?.error));
          const orders = data?.orders || [];
          
          ordersToUpsert = Array.isArray(orders) ? orders.map((o: any) => ({
            marketplace_id: store.id,
            external_order_id: String(o.id),
            ordered_at: o.creationDate || new Date().toISOString(),
            normalized_status: String(o.status || "").toUpperCase() === "DELIVERED" ? "delivered" : "pending",
            gross_amount: o.items ? o.items.reduce((sum: number, i: any) => sum + (i.prices ? i.prices[0].total : 0), 0) : 0,
            currency: String(o.currency || "RUB")
          })) : [];
        }

        if (ordersToUpsert.length > 0) {
          await supabase.from("v2_unified_orders").upsert(ordersToUpsert, { onConflict: "marketplace_id, external_order_id" });
          success_count++;
        }
      } catch (err) {
        error_log.push(`[${store.name || store.id}] Error: ${String(err)}`);
      }
    }

    return new Response(JSON.stringify({ stores_processed: stores.length, success_count, error_log }), { 
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (globalErr) {
    return new Response(JSON.stringify({ error: String(globalErr) }), { 
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
