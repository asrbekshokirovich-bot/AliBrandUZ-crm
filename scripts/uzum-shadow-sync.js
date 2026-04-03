// ============================================================
// AliBrand Unified Marketplace Sync — Gold Standard Edition
// Reads ALL credentials from marketplace_stores table (Supabase).
// NO hardcoded keys. NO stale tokens.
// ============================================================
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// --- Connection ---
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Helpers ---

/**
 * Normalize any raw status string into the 4 known dashboard values.
 * MarketplaceAnalytics.tsx checks for these using .includes() logic.
 */
function normalizeStatus(raw) {
  const st = String(raw || '').toUpperCase();
  if (['DELIVERED', 'COMPLETED', 'DONE', 'ARRIVED', 'HANDED_OVER', 'DELIVERY_DELIVERED'].some(s => st.includes(s))) return 'DELIVERED';
  if (['CANCELLED', 'CANCELED', 'REJECTED', 'NOT_ACCEPTED', 'CANCEL'].some(s => st.includes(s))) return 'CANCELLED';
  if (['RETURN', 'RETURNED', 'VOSVRAT'].some(s => st.includes(s))) return 'RETURNED';
  return st;
}

/**
 * Fetch live RUB → UZS exchange rate.
 * Falls back to 135 if the API is unreachable.
 */
async function fetchLiveRubToUzs() {
  const APIS = [
    'https://api.exchangerate-api.com/v4/latest/RUB',
    'https://open.er-api.com/v6/latest/RUB'
  ];
  for (const url of APIS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data?.rates?.UZS || data?.conversion_rates?.UZS;
      if (rate && rate > 0) {
        console.log(`[EXCHANGE] Live rate: 1 RUB = ${rate} UZS (source: ${url})`);
        return rate;
      }
    } catch (_) { /* try next */ }
  }
  console.warn('[EXCHANGE] All live APIs failed. Using fallback: 1 RUB = 135 UZS');
  return 135;
}

/**
 * Get the correct API key for a store.
 * Tries many name variants of api_key_secret_name to handle naming mismatches
 * between what's stored in the DB and what was actually registered as a GitHub Secret.
 */
function resolveApiKey(store) {
  // Direct api_key column — fastest path if user stored key directly
  if (store.api_key && store.api_key.trim().length > 10) {
    return store.api_key.trim();
  }

  const secretName = store.api_key_secret_name;
  if (secretName) {
    // Try exact match first
    if (process.env[secretName]?.trim().length > 10) return process.env[secretName].trim();

    // Build normalized variants: replace dots and spaces with underscores, try different casings
    const normalized = secretName.replace(/[\.\s-]/g, '_');
    const upper = normalized.toUpperCase();
    const candidates = [
      normalized,
      upper,
      normalized.toLowerCase(),
      // e.g. UZUM_Atlas.Market_API_KEY -> UZUM_ATLAS_MARKET_API_KEY
      upper.replace(/_API_KEY$/, '_API_KEY'),
    ];

    for (const candidate of candidates) {
      if (process.env[candidate]?.trim().length > 10) {
        console.log(`  [KEY] Resolved "${secretName}" → env var "${candidate}"`);
        return process.env[candidate].trim();
      }
    }

    // Last-resort: scan all environment variables for a fuzzy match
    const storeNameNorm = String(store.name || '').toUpperCase().replace(/[\.\s-]/g, '_');
    for (const [envKey, envVal] of Object.entries(process.env)) {
      if (!envVal || envVal.length < 10) continue;
      const envNorm = envKey.toUpperCase().replace(/[\.\s-]/g, '_');
      if (envNorm.includes(storeNameNorm) || storeNameNorm.includes(envNorm.replace(/^(UZUM|YANDEX)_/,'').replace(/_API_KEY$/, ''))) {
        console.log(`  [KEY] Fuzzy-matched "${secretName}" → env var "${envKey}"`);
        return envVal.trim();
      }
    }
  }
  return null;
}

/**
 * Update sync status in marketplace_stores after processing.
 */
async function updateSyncStatus(storeId, status, errorMsg = null) {
  await supabase.from('marketplace_stores').update({
    sync_status: status,
    last_sync_at: new Date().toISOString(),
    sync_error: errorMsg,
    updated_at: new Date().toISOString()
  }).eq('id', storeId);
}

// --- Uzum Sync ---
async function syncUzumStore(store, apiKey, dateFromMs) {
  const shopId = store.shop_id || store.seller_id;
  if (!shopId) throw new Error('No shop_id or seller_id defined in marketplace_stores row');

  const bearerToken = apiKey.startsWith('Bearer') ? apiKey : `Bearer ${apiKey}`;

  // Uzum: try with shopIds param, fall back to sellerId param
  const endpoints = [
    `https://seller.uzum.uz/api/v1/orders?shopIds=${shopId}&size=500&dateFrom=${dateFromMs}`,
    `https://seller.uzum.uz/api/v1/orders?sellerId=${shopId}&size=500&dateFrom=${dateFromMs}`
  ];

  let data = null;
  let lastStatus = 0;
  let lastBody = '';

  for (const url of endpoints) {
    console.log(`  [Uzum] GET ${url}`);
    const resp = await fetch(url, {
      headers: {
        'Authorization': bearerToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    lastStatus = resp.status;
    lastBody = await resp.text();

    if (resp.ok) {
      try { data = JSON.parse(lastBody); } catch (_) { throw new Error(`Uzum JSON parse error: ${lastBody.substring(0, 200)}`); }
      break;
    }
    console.warn(`  [Uzum] HTTP ${resp.status} on ${url} — trying next...`);
    console.warn(`         Response: ${lastBody.substring(0, 200)}`);
  }

  if (!data) throw new Error(`Uzum HTTP ${lastStatus}: ${lastBody.substring(0, 300)}`);

  const orders = data?.payload?.orders || data?.payload || data?.orders || [];
  if (!Array.isArray(orders)) {
    console.warn(`  [Uzum] Unexpected payload shape:`, JSON.stringify(data).substring(0, 300));
    return [];
  }

  return orders.map(o => ({
    store_id: store.id,
    external_order_id: String(o.id || o.orderId || o.order_id),
    ordered_at: o.createTime || o.createdAt || o.created_at || new Date().toISOString(),
    status: normalizeStatus(o.status || o.state || ''),
    total_amount: o.totalAmount || o.total_amount || o.price || o.amount || 0,
    currency: 'UZS',
    platform: 'uzum'
  })).filter(o => o.external_order_id && o.external_order_id !== 'undefined');
}

// --- Yandex Sync ---
async function syncYandexStore(store, apiKey, dateFromMs, rubToUzsRate) {
  const campaignId = store.campaign_id || store.fbs_campaign_id || store.fby_campaign_id;
  if (!campaignId) throw new Error('No campaign_id defined in marketplace_stores row');

  // Yandex OAuth format: the token stored in DB is already the raw ACMA:... token
  // Yandex API expects: "OAuth <token>" without quotes inside the header value
  let authHeader;
  if (apiKey.startsWith('OAuth ') || apiKey.startsWith('Bearer ')) {
    authHeader = apiKey;
  } else {
    authHeader = `OAuth ${apiKey}`;
  }

  const d = new Date(dateFromMs);
  const fromDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Fetch multiple pages (Yandex caps at 50 per request)
  let allOrders = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.partner.market.yandex.ru/campaigns/${campaignId}/orders?pageSize=50&page=${page}&fromDate=${fromDate}`;
    console.log(`  [Yandex] GET ${url}`);

    const resp = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Yandex HTTP ${resp.status}: ${body.substring(0, 300)}`);
    }

    const data = await resp.json();
    const orders = data?.orders || [];
    allOrders = allOrders.concat(orders);

    // Yandex paginates — check if there is more
    const pager = data?.pager || {};
    const totalPages = pager.pagesCount || 1;
    if (page >= totalPages || orders.length === 0) hasMore = false;
    else page++;
  }

  console.log(`  [Yandex] Fetched ${allOrders.length} raw orders across ${page} page(s)`);

  return allOrders.map(o => {
    // Calculate total in RUB from items array
    let rawRub = 0;
    if (o.itemsTotal) rawRub = o.itemsTotal;
    else if (o.total) rawRub = o.total;
    else if (Array.isArray(o.items)) {
      rawRub = o.items.reduce((sum, item) => {
        const itemPrice = item.prices?.buyerPriceBeforeDiscount || item.prices?.buyerPrice || item.price || 0;
        return sum + (itemPrice * (item.count || 1));
      }, 0);
    }

    const amountUzs = Math.round(rawRub * rubToUzsRate);

    return {
      store_id: store.id,
      external_order_id: String(o.id),
      ordered_at: o.creationDate || o.statusUpdateDate || new Date().toISOString(),
      status: normalizeStatus(o.status || ''),
      total_amount: amountUzs,
      currency: 'UZS', // Normalized from RUB to UZS at live rate
      platform: 'yandex'
    };
  }).filter(o => o.external_order_id && o.external_order_id !== 'undefined');
}

// --- Main Orchestrator ---
async function runSync() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${new Date().toISOString()}] AliBrand Unified Marketplace Sync Starting...`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch live exchange rate FIRST
  const rubToUzsRate = await fetchLiveRubToUzs();

  // Load ALL stores directly from Supabase — the single source of truth
  const { data: allStores, error: storesError } = await supabase
    .from('marketplace_stores')
    .select('*')
    .in('platform', ['uzum', 'yandex', 'Uzum', 'Yandex']);

  if (storesError) {
    console.error('[FATAL] Could not load stores from Supabase:', storesError);
    process.exit(1);
  }

  if (!allStores || allStores.length === 0) {
    console.error('[FATAL] No uzum/yandex stores found in marketplace_stores table.');
    console.error('        Please verify the "platform" column values in Supabase.');
    process.exit(1);
  }

  console.log(`[INFO] Loaded ${allStores.length} stores from Supabase:\n`);
  allStores.forEach((s, i) => {
    const hasKey = resolveApiKey(s) ? '✓ Key found' : '✗ NO KEY';
    console.log(`  ${i+1}. [${s.platform?.toUpperCase()}] ${s.name} — ${hasKey}`);
  });
  console.log('');

  // 45-day historical deep scan
  const dateFromMs = Date.now() - (45 * 24 * 60 * 60 * 1000);
  console.log(`[INFO] Deep scan window: last 45 days (from ${new Date(dateFromMs).toISOString().split('T')[0]})\n`);

  let totalInserted = 0;
  let successCount = 0;
  let failCount = 0;
  const summaryLog = [];

  for (const store of allStores) {
    const platformLC = String(store.platform || '').toLowerCase();
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[STORE] ${store.name} (${store.platform?.toUpperCase()}) — ID: ${store.id}`);

    // Resolve API key directly from DB row
    const apiKey = resolveApiKey(store);
    if (!apiKey) {
      const msg = `No api_key found. Ensure the "api_key" column is set in Supabase for this store.`;
      console.error(`  [SKIP] ${msg}`);
      await updateSyncStatus(store.id, 'NO_KEY', msg);
      failCount++;
      summaryLog.push({ store: store.name, status: 'SKIP', reason: msg });
      continue;
    }

    let orders = [];
    let syncError = null;

    try {
      if (platformLC === 'uzum') {
        orders = await syncUzumStore(store, apiKey, dateFromMs);
      } else if (platformLC === 'yandex') {
        orders = await syncYandexStore(store, apiKey, dateFromMs, rubToUzsRate);
      } else {
        console.warn(`  [SKIP] Unknown platform: ${store.platform}`);
        continue;
      }
    } catch (err) {
      syncError = err.message || String(err);
      console.error(`  [ERROR] Fetch failed: ${syncError}`);
    }

    // Upsert orders if we got any
    if (orders.length > 0 && !syncError) {
      console.log(`  [DB] Upserting ${orders.length} orders into marketplace_orders...`);

      // Chunk into batches of 200 to stay safe with Supabase limits
      const BATCH_SIZE = 200;
      let batchErrors = [];
      for (let i = 0; i < orders.length; i += BATCH_SIZE) {
        const chunk = orders.slice(i, i + BATCH_SIZE);
        const { error: upsertErr } = await supabase
          .from('marketplace_orders')
          .upsert(chunk, { onConflict: 'store_id,external_order_id' });
        if (upsertErr) {
          batchErrors.push(upsertErr.message);
          console.error(`  [DB ERROR] Batch ${Math.floor(i/BATCH_SIZE)+1}:`, upsertErr);
        }
      }

      if (batchErrors.length > 0) {
        syncError = `Partial upsert errors: ${batchErrors.join('; ')}`;
        await updateSyncStatus(store.id, 'ERROR', syncError);
        failCount++;
        summaryLog.push({ store: store.name, status: 'ERROR', orders: orders.length, reason: syncError });
      } else {
        totalInserted += orders.length;
        successCount++;
        await updateSyncStatus(store.id, 'SUCCESS', null);
        summaryLog.push({ store: store.name, status: 'SUCCESS', orders: orders.length });
        console.log(`  [OK] ${orders.length} orders synced. Status → SUCCESS`);
      }
    } else if (syncError) {
      await updateSyncStatus(store.id, 'ERROR', syncError);
      failCount++;
      summaryLog.push({ store: store.name, status: 'ERROR', orders: 0, reason: syncError });
    } else {
      // 0 orders but no error = valid (no orders in window)
      await updateSyncStatus(store.id, 'SUCCESS', null);
      successCount++;
      summaryLog.push({ store: store.name, status: 'SUCCESS', orders: 0 });
      console.log(`  [OK] 0 orders in last 45 days (store may be new or inactive). Status → SUCCESS`);
    }
  }

  // Final Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[DONE] Sync complete in ${elapsed}s`);
  console.log(`       Stores processed: ${allStores.length}`);
  console.log(`       Success: ${successCount} | Failed: ${failCount}`);
  console.log(`       Total orders inserted/updated: ${totalInserted}`);
  console.log(`       Exchange rate used: 1 RUB = ${rubToUzsRate} UZS`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('Per-store summary:');
  summaryLog.forEach(s => {
    const icon = s.status === 'SUCCESS' ? '✅' : '❌';
    const detail = s.status === 'SUCCESS' ? `${s.orders} orders` : s.reason;
    console.log(`  ${icon} ${s.store}: ${detail}`);
  });

  if (failCount > 0) {
    process.exit(1); // Signal GitHub Actions that there were failures
  }
}

runSync().catch(err => {
  console.error('[UNHANDLED ERROR]', err);
  process.exit(1);
});
