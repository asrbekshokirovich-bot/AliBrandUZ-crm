import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Vercel limit is 45s. We set internal timeout to 40s to be safe
const MAX_EXECUTION_MS = 40000;
const BATCH_SIZE = 3; // Har bir cron siklda max 3 ta do'konni qayta ishlaymiz, 40 sekundga sig'ishi uchun

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Pop pending jobs from queue
    const { data: jobs, error: queueError } = await supabase
      .from('sync_jobs_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queueError) throw new Error("Navbatni olishda xatolik: " + queueError.message);
    
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Navbat bo'sh." }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[sync-dispatcher] Navbatdan ${jobs.length} ta vazifa olindi.`);

    // 2. Mark as processing
    const jobIds = jobs.map(j => j.id);
    await supabase.from('sync_jobs_queue').update({
      status: 'processing',
      started_at: new Date().toISOString()
    }).in('id', jobIds);

    const results = [];

    // 3. Process jobs sequentially or in parallel depending on safety. Sequential is safer for API rate limits.
    for (const job of jobs) {
       if (Date.now() - startTime >= MAX_EXECUTION_MS) {
          console.warn(`[sync-dispatcher] Vaqt tugamoqda (40s), qolgan ishlar keyingi siklga qoldirildi.`);
          break;
       }

       let success = false;
       let errorMsg: string | null = null;
       const jobTime = Date.now();
       
       console.log(`[sync-dispatcher] Processing Job ${job.id}: [${job.platform}] ${job.store_name} - ${job.sync_type}`);

       try {
         let fnName = '';
         let body: any = { store_id: job.store_id, action: 'sync', ...job.params };

         if (job.platform === 'uzum') {
           fnName = job.sync_type === 'orders' ? 'uzum-orders' :
                    job.sync_type === 'stock' ? 'uzum-stocks' :
                    job.sync_type === 'listings' ? 'uzum-products' : 
                    job.sync_type === 'finance' ? 'uzum-finance' :
                    job.sync_type === 'returns' ? 'uzum-returns' : '';
         } else if (job.platform === 'yandex') {
           fnName = job.sync_type === 'orders' ? 'yandex-orders' :
                    job.sync_type === 'stock' ? 'yandex-stocks' :
                    job.sync_type === 'listings' ? 'yandex-products' : 
                    job.sync_type === 'finance' ? 'yandex-finance' :
                    job.sync_type === 'returns' ? 'yandex-returns' : '';
         }


         if (!fnName) throw new Error(`Noma'lum sync_type yoki platforma: ${job.sync_type} / ${job.platform}`);

         // Invoke the specific worker edge function
         const { data: fnData, error: fnErr } = await supabase.functions.invoke(fnName, {
           body: body
         });

         if (fnErr) {
            throw new Error(fnErr.message);
         } else if (fnData && fnData.success === false) {
            throw new Error(fnData.error || "Function returned success=false");
         }

         success = true;
       } catch (err: any) {
         errorMsg = err.message || JSON.stringify(err);
         console.error(`[sync-dispatcher] Job ${job.id} bajarilmadi:`, errorMsg);
       }

       results.push({
         job_id: job.id,
         success,
         duration_ms: Date.now() - jobTime,
         error: errorMsg
       });

       // 4. Update job status
       await supabase.from('sync_jobs_queue').update({
          status: success ? 'completed' : 'error',
          completed_at: new Date().toISOString(),
          error_details: errorMsg
       }).eq('id', job.id);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[sync-dispatcher] ${results.length} ta vazifa ${totalDuration}ms da yakunlandi.`);

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      duration_ms: totalDuration,
      results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
     return new Response(JSON.stringify({ success: false, error: error.message }), 
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
