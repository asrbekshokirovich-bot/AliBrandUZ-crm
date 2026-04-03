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

// Master Store Registry for Auto-Onboarding (Gold Standard)
const MASTER_STORES = [
  { name: "ALI BRAND MARKET", platform: "uzum", shop_id: "356944", seller_id: "49052", api_key_secret_name: "UZUM_ALI_BRAND_MARKET_API_KEY", auto_sync_enabled: true, raw_fallback_key: "q76imT5nndH+6ti71ilympxn9mAedVsqsm/aBAoPlL4=" },
  { name: "Atlas Market", platform: "uzum", shop_id: "316698", seller_id: "69508", api_key_secret_name: "UZUM_ATLAS_MARKET_API_KEY", auto_sync_enabled: true, raw_fallback_key: "7O4XDl8UrwX6ClbIrSenJFGdQD5RjUax9sns32ZkHS8=" },
  { name: "Uzum China Market", platform: "uzum", shop_id: "316698", seller_id: "69555", api_key_secret_name: "UZUM_CHINA_MARKET_API_KEY", auto_sync_enabled: true, raw_fallback_key: "oC8lQHXfVx6KHR1L/+CdFzvK2DjCdjezBci/7mX7FKc=" },
  { name: "Xit market", platform: "uzum", shop_id: "316698", seller_id: "70010", api_key_secret_name: "UZUM_XIT_MARKET_API_KEY", auto_sync_enabled: true, raw_fallback_key: "ng9XFUFejJqrgYkhHyBJCnZWBZG12IfX2oziLHx3Ddk=" },
  { name: "Atlas.Market", platform: "uzum", shop_id: "316698", seller_id: "88409", api_key_secret_name: "UZUM_ATLAS_MARKET_2_API_KEY", auto_sync_enabled: true, raw_fallback_key: "46043gptOo1U9FIc0FdADEZ+c4pcn0L7dGapoAMwZG8=" },
  { name: "BM Store", platform: "uzum", shop_id: "322295", seller_id: "89165", api_key_secret_name: "UZUM_BM_STORE_API_KEY", auto_sync_enabled: true, raw_fallback_key: "4gpWWyo+2JR1byAcyPEPE2j/OXL1EfZD2bFUJwejxks=" },
  { name: "BM_store", platform: "uzum", shop_id: "322295", seller_id: "92638", api_key_secret_name: "UZUM_BM_STORE_2_API_KEY", auto_sync_enabled: true, raw_fallback_key: "Y1Qa78ItrP0704iLx4MqY+3qjlInOGiSp3Hml4BmL1Y=" },
  { name: "Alibrand.Market", platform: "uzum", shop_id: "356944", seller_id: "92815", api_key_secret_name: "UZUM_ALIBRAND_MARKET_API_KEY", auto_sync_enabled: true, raw_fallback_key: "86uM2WvEKHAbJxk67TGog8OegmOoe3+qEZC8JZkCS3E=" },
  
  { name: "FBY - AliBrand.Market", platform: "yandex", business_id: "216469176", campaign_id: "148843590", api_key_secret_name: "YANDEX_ALIBRAND_MARKET_API_KEY", auto_sync_enabled: true, raw_fallback_key: "ACMA:IYTR0ofK4q0q8RhEsQUp2BGlsIVkKrAKqRiYu9iL:db19f31d" },
  { name: "FBS - Atlas Market", platform: "yandex", business_id: "216469176", campaign_id: "148987777", api_key_secret_name: "YANDEX_ATLAS_MARKET_API_KEY", auto_sync_enabled: true, raw_fallback_key: "ACMA:IYTR0ofK4q0q8RhEsQUp2BGlsIVkKrAKqRiYu9iL:db19f31d" },
  { name: "FBS - BM.Store 2", platform: "yandex", business_id: "216515645", campaign_id: "148916383", api_key_secret_name: "YANDEX_BM_STORE_API_KEY", auto_sync_enabled: true, raw_fallback_key: "ACMA:oK7aYMHhpQXvElMADbrKVbNe96oe8WiWdUBldpyY:18afefdd" },
  { name: "FBY - BM.Store 3", platform: "yandex", business_id: "216515645", campaign_id: "148939239", api_key_secret_name: "YANDEX_BM_STORE_3_API_KEY", auto_sync_enabled: true, raw_fallback_key: "ACMA:oK7aYMHhpQXvElMADbrKVbNe96oe8WiWdUBldpyY:18afefdd" }
];

function normalizeStatus(raw) {
  const st = String(raw || '').toUpperCase();
  if (['DELIVERED', 'COMPLETED', 'DONE', 'ARRIVED', 'HANDED_', 'DELIVERY_DELIVERED'].some(s => st.includes(s))) return "DELIVERED";
  if (['CANCELLED', 'CANCELED', 'REJECTED', 'NOT_', 'CANCEL'].some(s => st.includes(s))) return "CANCELLED";
  if (['RETURN', 'VOSVRAT', 'RETURNED'].some(s => st.includes(s))) return "RETURNED";
  return st; // Fallback to raw if unmatched
}

async function fetchLiveRubRate() {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/RUB");
    if (!res.ok) throw new Error("API not ok");
    const data = await res.json();
    const uzsRate = data.rates.UZS;
    if (uzsRate) {
      console.log(`[LIVE EXCHANGE] 1 RUB = ${uzsRate} UZS`);
      return uzsRate;
    }
  } catch (err) {
    console.warn(`[!] Live Exchange API failed. Utilizing fallback rate: 1 RUB = 135 UZS`);
  }
  return 135; // Fallback rate as backup
}

async function onboardStores() {
  console.log("--> Performing Deep Store Onboarding Verification...");
  const { data: dbStores, error } = await supabase.from('marketplace_stores').select('*');
  if (error) { throw error; }

  for (const ms of MASTER_STORES) {
    const existing = dbStores.find(e => 
      (ms.seller_id && e.seller_id === ms.seller_id) || 
      (ms.campaign_id && e.campaign_id === ms.campaign_id) ||
      e.name === ms.name
    );
    const { raw_fallback_key, ...payload } = ms; // Do not upsert raw_fallback_key physically if table doesn't support it

    if (existing) {
      // Just ensure standard details
      await supabase.from('marketplace_stores').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('marketplace_stores').insert({ ...payload, updated_at: new Date().toISOString() });
    }
  }
}

async function runSync() {
  console.log(`\n\n[${new Date().toISOString()}] Initiating Multi-Platform Analytics Sync (Deep Scan)...`);

  // Dynamically load Edge Function Secrets
  try {
    console.log('Fetching encrypted environment secrets from Supabase vault...');
    const secretResp = await fetch(`${SUPABASE_URL}/functions/v1/get-secrets`, {
      headers: { Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (secretResp.ok) {
      const secretData = await secretResp.json();
      if (secretData && secretData.ENVIRONMENT) {
        Object.assign(process.env, secretData.ENVIRONMENT);
      }
    }
  } catch (err) {
    console.warn('Could not fetch remote secrets.');
  }

  // 1. Onboard stores
  await onboardStores();

  // Fetch LIVE exchange rate for Yandex translation
  const rubToUzsRate = await fetchLiveRubRate();

  // Fetch updated stores list after onboarding
  const { data: allStores, error: storesError } = await supabase.from('marketplace_stores').select('*');
  if (storesError) {
    console.error('FATAL: Failed to fetch stores from Supabase:', storesError);
    process.exit(1);
  }

  const activeStores = (allStores || []).filter(s => ['uzum', 'yandex'].includes(String(s.platform || '').toLowerCase()));
  
  for (const store of activeStores) {
    try {
      console.log(`\nProcessing ${store.platform.toUpperCase()} Store: ${store.name}`);
      
      const masterConfig = MASTER_STORES.find(m => m.name === store.name || (m.shop_id && m.shop_id === store.shop_id) || (m.campaign_id && m.campaign_id === store.campaign_id));
      let apiKey = process.env[store.api_key_secret_name] || (masterConfig && masterConfig.raw_fallback_key);
      
      if (!apiKey) {
        console.warn(`[!] Skipping ${store.name}: Missing API Key`);
        continue;
      }

      // 45 DAYS HISTORICAL DEEP SCAN
      const dateFromMs = Date.now() - (45 * 24 * 60 * 60 * 1000); 

      let validOrders = [];

      // --- UZUM LOGIC ---
      if (store.platform === 'uzum') {
        const shopId = store.shop_id || store.external_shop_id;
        if (!shopId) continue;

        const url = `https://seller.uzum.uz/api/v1/orders?shopIds=${shopId}&size=500&dateFrom=${dateFromMs}`;
        const resp = await fetch(url, {
          headers: {
            'Authorization': apiKey.startsWith('Bearer') ? apiKey : `Bearer ${apiKey}`,
            'Accept': 'application/json'
          }
        });

        if (!resp.ok) {
          console.error(` [-] Uzum HTTP ${resp.status} - Skipping...`);
          continue;
        }

        const data = await resp.json();
        const payload = data?.payload?.orders || data?.payload || [];

        validOrders = Array.isArray(payload) ? payload.map((o) => {
          const amount = o.totalAmount || o.price || o.total_amount || o.amount || 0;
          const oDate = o.createTime || o.created_at || o.date || new Date().toISOString();
          const stat = String(o.status || o.state || '');
          return {
            store_id: store.id,
            external_order_id: String(o.id || o.orderId || o.order_id),
            ordered_at: oDate, 
            status: normalizeStatus(stat),
            total_amount: amount,
            currency: 'UZS',
            items: o.items || []
          };
        }).filter(o => o.external_order_id !== 'undefined') : [];

      // --- YANDEX LOGIC ---
      } else if (store.platform === 'yandex') {
        const campaignId = store.campaign_id;
        if (!campaignId) continue;
        
        // Yandex uses YYYY-MM-DD
        const d = new Date(dateFromMs);
        const dateFromStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        // Yandex requires OAuth prefix
        const authPrefix = apiKey.startsWith("OAuth") || apiKey.startsWith("Bearer") ? apiKey : `OAuth oauth_token="${apiKey}", oauth_client_id="YOUR_ID"`;
        const pureOAuth = apiKey.includes("ACMA") ? `OAuth oauth_token="${apiKey}"` : `Bearer ${apiKey}`;

        const url = `https://api.partner.market.yandex.ru/campaigns/${campaignId}/orders?pageSize=50&updateAtFrom=${dateFromStr}`;
        const resp = await fetch(url, {
          headers: {
            'Authorization': pureOAuth,
            'Accept': 'application/json'
          }
        });

        if (!resp.ok) {
          console.error(` [-] Yandex HTTP ${resp.status} - Skipping...`);
          const tt = await resp.text();
          console.error(`    > ${tt.substring(0, 150)}`);
          continue;
        }

        const data = await resp.json();
        const ordersPayload = data?.orders || [];

        validOrders = Array.isArray(ordersPayload) ? ordersPayload.map((o) => {
          const rawAmountRub = o.items ? o.items.reduce((sum, i) => sum + (i.prices ? i.prices[0].total : 0), 0) : 0;
          const uziAmount = rawAmountRub * rubToUzsRate; // LIVE CONVERSION
          
          return {
            store_id: store.id,
            external_order_id: String(o.id),
            ordered_at: o.creationDate || new Date().toISOString(),
            status: normalizeStatus(o.status),
            total_amount: uziAmount, // Persist normalized value
            currency: 'UZS', // Mark as successfully converted inside DB
            items: o.items || []
          };
        }) : [];
      }

      if (validOrders.length > 0) {
        const { error: upsertErr } = await supabase
          .from("marketplace_orders")
          .upsert(validOrders, { onConflict: "store_id, external_order_id" });

        if (upsertErr) {
          console.error(` [-] Database Upsert Failed for ${store.name}:`, upsertErr);
        } else {
          console.log(` [+] Synced & Updated ${validOrders.length} orders for ${store.name} (Last 45 Days).`);
        }
      } else {
        console.log(` [~] No new orders found in recent window for ${store.name}.`);
      }

    } catch (err) {
       console.error(` [FATAL LOOP] Exception for store ${store.name}:`, err.message);
    }
  }
  
  console.log(`\n[${new Date().toISOString()}] Sync process complete. Single Source of Truth stabilized.`);
}

runSync().catch(console.error);
