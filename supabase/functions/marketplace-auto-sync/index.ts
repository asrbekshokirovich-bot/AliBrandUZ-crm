import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let syncType = "orders";
    let isAutoSync = false;
    let explicitStoreId = null;

    try {
      const body = await req.json();
      syncType = body.sync_type || "orders";
      isAutoSync = body.auto === true;
      explicitStoreId = body.store_id || null;
    } catch {
      // Use defaults if no body
    }

    console.log(`[marketplace-auto-sync] Sifat (Quality) Orkesratori ishga tushdi. Turi: ${syncType}, Do'kon ID: ${explicitStoreId || 'Barchasi'}`);

    let storesQuery = supabase.from("marketplace_stores").select("id, name, platform").eq("is_active", true);
    if (explicitStoreId) {
        storesQuery = storesQuery.eq("id", explicitStoreId);
    }
    const { data: stores, error: storesError } = await storesQuery;
    
    if (storesError || !stores || stores.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Aktiv do'konlar topilmadi", jobsEnqueued: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Navbat logikasi
    const insertPayloads: any[] = [];

    // User qo'lda bosganida:
    if (!isAutoSync && explicitStoreId) {
        insertPayloads.push({
           store_id: stores[0].id,
           store_name: stores[0].name,
           platform: stores[0].platform,
           sync_type: syncType,
           status: 'pending',
           priority: 100, // Qo'lda qilingani uchun yuqori bo'ladi
           params: { lightweight: true, days: 3 } // Tezkorroq
        });
    } else {
        // Avtomat (Orqaga 30 kun deep-sync) barcha do'konlar uchun "Mukammal Zanjir"
        // Zanjir prioriteti muhim: Orders -> Finance -> Returns -> Stock (Shtular ayirish)
        for (const store of stores) {
           insertPayloads.push(
               { store_id: store.id, store_name: store.name, platform: store.platform, sync_type: 'orders', status: 'pending', priority: 40, params: { lightweight: false, days: 30 } },
               { store_id: store.id, store_name: store.name, platform: store.platform, sync_type: 'finance', status: 'pending', priority: 30, params: { lightweight: false, days: 30 } },
               { store_id: store.id, store_name: store.name, platform: store.platform, sync_type: 'returns', status: 'pending', priority: 20, params: { lightweight: false, days: 30 } },
               { store_id: store.id, store_name: store.name, platform: store.platform, sync_type: 'stock', status: 'pending', priority: 10, params: { lightweight: false } }
           );
        }
    }

    const { error: insertErr } = await supabase.from('sync_jobs_queue').insert(insertPayloads);

    if (insertErr) {
       console.error(`[marketplace-auto-sync] Navbat yozishda xatolik:`, insertErr);
       throw new Error(`Queue insert failed: ${insertErr.message}`);
    }

    console.log(`[marketplace-auto-sync] ${insertPayloads.length} ta vazifalar navbatdagi "Mukammal Zanjir" ga biriktirildi.`);

    try {
        supabase.functions.invoke('sync-dispatcher', { body: {} }).catch(() => {});
    } catch(e) {}

    return new Response(
      JSON.stringify({
         success: true,
         message: "Mukammal asinxron navbat qo'shildi va dispetcherga chaqiruv jo'natildi.",
         jobsEnqueued: insertPayloads.length,
         duration_ms: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[marketplace-auto-sync] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
