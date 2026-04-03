// Bypass SSL Validation permanently for this script
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: Missing Supabase Environment Variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runSync() {
  console.log(`[${new Date().toISOString()}] Initiating Uzum SSL-Bypass Sync...`);

  const { data: stores, error: storesError } = await supabase
    .from('v2_marketplaces')
    .select('*')
    .eq('is_active', true)
    .eq('platform', 'uzum');

  if (storesError) {
    console.error('FATAL: Failed to fetch Uzum stores from Supabase:', storesError);
    process.exit(1);
  }

  if (!stores || stores.length === 0) {
    console.log('No active Uzum stores found. Exiting.');
    return;
  }

  console.log(`Found ${stores.length} active Uzum stores.`);

  for (const store of stores) {
    try {
      console.log(`\nProcessing Uzum Store: ${store.name}`);
      
      const apiKey = process.env[store.api_key_secret_name] || store.temp_api_key;
      
      // In a real environment, keys are pulled dynamically. Assuming the local .env has them.
      if (!apiKey) {
        console.warn(`[!] Skipping ${store.name}: Missing API Key in ENV for '${store.api_key_secret_name}'`);
        continue;
      }

      if (!store.external_shop_id) {
        console.warn(`[!] Skipping ${store.name}: Missing external_shop_id`);
        continue;
      }

      const dateFromMs = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
      const url = `https://api.business.uzum.uz/api/v1/orders?shopIds=${store.external_shop_id}&size=100&dateFrom=${dateFromMs}`;

      console.log(` Fetching Uzum API... (${url})`);

      const resp = await fetch(url, {
        headers: {
          'Authorization': apiKey.startsWith('Bearer') ? apiKey : `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 NodeJS/UzumSyncWorker'
        }
      });

      const rawText = await resp.text();

      if (!resp.ok) {
        console.error(` [-] Error fetching Uzum API for ${store.name}: HTTP ${resp.status}`);
        console.error(`     Raw response snippet: ${rawText.substring(0, 300)}`);
        continue;
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(` [-] Failed to parse JSON for ${store.name}: ${parseErr.message}`);
        console.error(`     Raw response snippet: ${rawText.substring(0, 300)}`);
        continue;
      }

      if (data && data.error) {
         console.error(` [-] API returned error inside JSON for ${store.name}: ${data.error}`);
         continue;
      }

      const payload = data?.payload?.orders || data?.payload || [];
      const ordersToUpsert = Array.isArray(payload) ? payload.map((o) => ({
        marketplace_id: store.id,
        external_order_id: String(o.id),
        ordered_at: o.createTime || new Date().toISOString(),
        normalized_status: String(o.status || '').toUpperCase() === 'DELIVERED' ? 'delivered' : 'pending',
        gross_amount: o.totalAmount || 0,
        currency: 'UZS'
      })) : [];

      if (ordersToUpsert.length > 0) {
        const { error: upsertErr } = await supabase
          .from("v2_unified_orders")
          .upsert(ordersToUpsert, { onConflict: "marketplace_id, external_order_id" });

        if (upsertErr) {
          console.error(` [-] Database Upsert Failed for ${store.name}:`, upsertErr);
        } else {
          console.log(` [+] Successfully upserted ${ordersToUpsert.length} orders for ${store.name}.`);
        }
      } else {
        console.log(` [~] No new orders found for ${store.name}.`);
      }

    } catch (err) {
       console.error(` [FATAL LOOP] Critical try/catch failure for store ${store.name}:`, err);
    }
  }
  
  console.log(`\n[${new Date().toISOString()}] Sync process complete.`);
}

runSync().catch(console.error);
