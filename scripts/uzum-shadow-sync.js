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

  // Dynamically load Edge Function Secrets so GitHub Actions natively knows the API Keys
  try {
    console.log('Fetching encrypted environment secrets from Supabase vault...');
    const secretResp = await fetch(`${SUPABASE_URL}/functions/v1/get-secrets`, {
      headers: { Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (secretResp.ok) {
      const secretData = await secretResp.json();
      if (secretData && secretData.ENVIRONMENT) {
        Object.assign(process.env, secretData.ENVIRONMENT);
        console.log('Successfully injected native Edge secrets into runtime.');
      }
    }
  } catch (err) {
    console.warn('Could not fetch remote secrets, relying on local .env variables.', err.message);
  }

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

      const dateFromMs = Date.now() - (60 * 24 * 60 * 60 * 1000); // 60 days aggressively
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
        continue;
      }

      if (data && data.error) {
         console.error(` [-] API returned error inside JSON for ${store.name}: ${data.error}`);
         continue;
      }

      const payload = data?.payload?.orders || data?.payload || [];
      console.log(` [*] Uzum API returned ${payload.length || 0} items in payload.`);
      
      if (Array.isArray(payload) && payload.length > 0) {
        // Log the first item's schema to ensure mapping is correct
        console.log(` [DEBUG] Schema of first order:`, JSON.stringify(payload[0]).substring(0, 500));
      }

      // Log DB rows before
      const { count: countBefore } = await supabase.from('v2_unified_orders').select('*', { count: 'exact', head: true }).eq('marketplace_id', store.id);
      console.log(` [DB] Rows in v2_unified_orders for ${store.name} BEFORE sync: ${countBefore}`);

      const ordersToUpsert = Array.isArray(payload) ? payload.map((o) => {
        // Fallback checks for different Uzum API schema versions
        const amount = o.totalAmount || o.price || o.total_amount || o.amount || 0;
        const oDate = o.createTime || o.created_at || o.date || new Date().toISOString();
        const stat = String(o.status || o.state || '').toUpperCase();
        
        return {
          marketplace_id: store.id,
          external_order_id: String(o.id || o.orderId || o.order_id),
          ordered_at: oDate,
          normalized_status: (stat === 'DELIVERED' || stat === 'COMPLETED' || stat === 'HANDED_OVER_TO_CUSTOMER') ? 'delivered' : 'pending',
          gross_amount: amount,
          currency: 'UZS'
        };
      }) : [];

      if (ordersToUpsert.length > 0) {
        // Filter out bad parses
        const validOrders = ordersToUpsert.filter(o => o.external_order_id !== 'undefined');
        
        const { error: upsertErr } = await supabase
          .from("v2_unified_orders")
          .upsert(validOrders, { onConflict: "marketplace_id, external_order_id" });

        if (upsertErr) {
          console.error(` [-] Database Upsert Failed for ${store.name}:`, upsertErr);
        } else {
          console.log(` [+] Successfully upserted ${validOrders.length} orders for ${store.name}.`);
        }
      } else {
        console.log(` [~] No new orders found to upsert for ${store.name}.`);
      }

      // Log DB rows after
      const { count: countAfter } = await supabase.from('v2_unified_orders').select('*', { count: 'exact', head: true }).eq('marketplace_id', store.id);
      console.log(` [DB] Rows in v2_unified_orders for ${store.name} AFTER sync: ${countAfter}`);

    } catch (err) {
       console.error(` [FATAL LOOP] Critical try/catch failure for store ${store.name}:`, err);
    }
  }
  
  console.log(`\n[${new Date().toISOString()}] Sync process complete.`);
}

runSync().catch(console.error);
