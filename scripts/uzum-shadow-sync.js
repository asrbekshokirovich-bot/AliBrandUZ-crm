// ============================================================
// AliBrand Unified Marketplace Sync — Supabase Edition
// ✅ Credentials stored directly in marketplace_stores.api_key
// ✅ No GitHub secrets needed. No secret naming issues.
// ✅ Update tokens: Supabase → Table Editor → marketplace_stores
// ============================================================
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('        Only these 2 env vars are needed. All API keys come from Supabase DB.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Normalize order status into dashboard values
// ---------------------------------------------------------------------------
function normalizeStatus(raw) {
  const st = String(raw || '').toUpperCase();
  if (['DELIVERED', 'COMPLETED', 'DONE', 'ARRIVED', 'HANDED_OVER', 'DELIVERY_DELIVERED'].some(s => st.includes(s))) return 'DELIVERED';
  if (['CANCELLED', 'CANCELED', 'REJECTED', 'NOT_ACCEPTED', 'CANCEL'].some(s => st.includes(s))) return 'CANCELLED';
  if (['RETURN', 'RETURNED', 'VOZVRAT'].some(s => st.includes(s))) return 'RETURNED';
  return st || 'PENDING';
}

// ---------------------------------------------------------------------------
// Live RUB → UZS exchange rate
// ---------------------------------------------------------------------------
async function fetchLiveRubToUzs() {
  const APIS = [
    'https://api.exchangerate-api.com/v4/latest/RUB',
    'https://open.er-api.com/v6/latest/RUB'
  ];
  for (const url of APIS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data?.rates?.UZS || data?.conversion_rates?.UZS;
      if (rate && rate > 0) {
        console.log(`[EXCHANGE] 1 RUB = ${rate} UZS (source: ${url})`);
        return rate;
      }
    } catch (_) { /* try next */ }
  }
  console.warn('[EXCHANGE] Live rate unavailable. Using fallback: 1 RUB = 135 UZS');
  return 135;
}

// ---------------------------------------------------------------------------
// Update sync_status in marketplace_stores after each store run
// ---------------------------------------------------------------------------
async function updateSyncStatus(storeId, status, errorMsg = null) {
  await supabase.from('marketplace_stores').update({
    sync_status: status,
    last_sync_at: new Date().toISOString(),
    sync_error: errorMsg,
    updated_at: new Date().toISOString()
  }).eq('id', storeId);
}

// ---------------------------------------------------------------------------
// Uzum Sync
// API key stored in marketplace_stores.api_key (Bearer token from seller.uzum.uz)
// Shop ID stored in marketplace_stores.shop_id
// ---------------------------------------------------------------------------
async function syncUzumStore(store, apiKey, dateFromMs) {
  const shopId = store.shop_id || store.seller_id;
  if (!shopId) throw new Error('shop_id is empty — set it in Supabase marketplace_stores.shop_id');

  const bearer = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey.trim()}`;

  const endpoints = [
    `https://seller.uzum.uz/api/v1/orders?shopIds=${shopId}&size=500&dateFrom=${dateFromMs}`,
    `https://api.business.uzum.uz/api/v1/orders?shopIds=${shopId}&size=500&dateFrom=${dateFromMs}`,
    `https://seller.uzum.uz/api/v1/orders?sellerId=${shopId}&size=500&dateFrom=${dateFromMs}`,
  ];

  let data = null;
  let lastStatus = 0;
  let lastSnippet = '';

  for (const url of endpoints) {
    console.log(`  [Uzum] GET ${url}`);
    const resp = await fetch(url, {
      headers: {
        'Authorization': bearer,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      redirect: 'follow'
    });

    lastStatus = resp.status;
    const ct = resp.headers.get('content-type') || '';
    const body = await resp.text();
    lastSnippet = body.substring(0, 200);

    // Detect HTML auth redirect (Uzum login page)
    if (body.trim().startsWith('<') || ct.includes('text/html')) {
      const title = body.match(/<title>(.*?)<\/title>/i)?.[1] || 'N/A';
      console.warn(`  [Uzum] HTML response (auth redirect) — "${title}" — trying next endpoint`);
      continue;
    }

    if (resp.ok) {
      try { data = JSON.parse(body); break; }
      catch (_) { throw new Error(`Uzum JSON parse error: ${body.substring(0, 150)}`); }
    }

    console.warn(`  [Uzum] HTTP ${resp.status} — ${body.substring(0, 120)} — trying next`);
  }

  if (!data) {
    throw new Error(`All Uzum endpoints failed. Last HTTP ${lastStatus}: ${lastSnippet}`);
  }

  const orders = data?.payload?.orders || data?.payload || data?.orders || [];
  if (!Array.isArray(orders)) return [];

  console.log(`  [Uzum] ✓ ${orders.length} orders received`);
  return orders.map(o => ({
    store_id:          store.id,
    external_order_id: String(o.id || o.orderId || o.order_id),
    ordered_at:        o.createTime || o.createdAt || o.created_at || new Date().toISOString(),
    status:            normalizeStatus(o.status || o.state || ''),
    total_amount:      o.totalAmount || o.total_amount || o.price || o.amount || 0,
    currency:          'UZS',
    platform:          'uzum'
  })).filter(o => o.external_order_id && o.external_order_id !== 'undefined');
}

// ---------------------------------------------------------------------------
// Yandex Market Sync
// API key stored in marketplace_stores.api_key (OAuth token from oauth.yandex.ru)
// Campaign ID stored in marketplace_stores.campaign_id
// Business ID stored in marketplace_stores.business_id (or seller_id)
// ---------------------------------------------------------------------------
async function syncYandexStore(store, apiKey, dateFromMs, rubToUzsRate) {
  const campaignId = store.campaign_id || store.fbs_campaign_id || store.fby_campaign_id;
  if (!campaignId) throw new Error('campaign_id is empty — set it in Supabase marketplace_stores.campaign_id');

  // Clean token (strip invisible chars from copy-paste)
  const cleanToken = apiKey.trim().replace(/[\r\n\t]/g, '');
  const authHeader = cleanToken.startsWith('OAuth ') || cleanToken.startsWith('Bearer ')
    ? cleanToken
    : `OAuth ${cleanToken}`;

  const businessId = store.business_id || store.seller_id;

  const headers = {
    'Authorization': authHeader,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (businessId) headers['X-Market-Partner-Id'] = String(businessId);

  console.log(`  [Yandex] CampaignId: ${campaignId} | BusinessId: ${businessId || 'N/A'} | Token: ${cleanToken.substring(0, 24)}...`);

  const d = new Date(dateFromMs);
  const fromDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  let allOrders = [];
  let page = 1;

  while (true) {
    const url = `https://api.partner.market.yandex.ru/campaigns/${campaignId}/orders?pageSize=50&page=${page}&fromDate=${fromDate}`;
    console.log(`  [Yandex] GET page ${page}: ${url}`);

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Yandex HTTP ${resp.status}: ${body.substring(0, 300)}`);
    }

    const data = await resp.json();
    const orders = data?.orders || [];
    allOrders = allOrders.concat(orders);

    const pager = data?.pager || {};
    const totalPages = pager.pagesCount || 1;
    if (page >= totalPages || orders.length === 0) break;
    page++;
  }

  console.log(`  [Yandex] ✓ ${allOrders.length} orders received across ${page} page(s)`);

  return allOrders.map(o => {
    let rawRub = 0;
    if (o.itemsTotal)            rawRub = o.itemsTotal;
    else if (o.total)            rawRub = o.total;
    else if (Array.isArray(o.items)) {
      rawRub = o.items.reduce((sum, item) => {
        const p = item.prices?.buyerPriceBeforeDiscount || item.prices?.buyerPrice || item.price || 0;
        return sum + (p * (item.count || 1));
      }, 0);
    }

    return {
      store_id:          store.id,
      external_order_id: String(o.id),
      ordered_at:        o.creationDate || o.statusUpdateDate || new Date().toISOString(),
      status:            normalizeStatus(o.status || ''),
      total_amount:      Math.round(rawRub * rubToUzsRate),
      currency:          'UZS',
      platform:          'yandex'
    };
  }).filter(o => o.external_order_id && o.external_order_id !== 'undefined');
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------
async function runSync() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${new Date().toISOString()}] AliBrand Marketplace Sync (Supabase Edition)`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`[INFO] Credentials: read from marketplace_stores.api_key (Supabase DB)`);
  console.log(`[INFO] To update a token: Supabase → Table Editor → marketplace_stores → api_key column\n`);

  const rubToUzsRate = await fetchLiveRubToUzs();

  // Load all active stores — all credentials come from Supabase
  const { data: allStores, error: storesError } = await supabase
    .from('marketplace_stores')
    .select('*')
    .in('platform', ['uzum', 'yandex', 'Uzum', 'Yandex']);

  if (storesError) { console.error('[FATAL]', storesError); process.exit(1); }
  if (!allStores?.length) {
    console.error('[FATAL] No uzum/yandex stores found. Check "platform" column values in Supabase.');
    process.exit(1);
  }

  console.log(`[INFO] ${allStores.length} stores loaded:\n`);
  allStores.forEach((s, i) => {
    const hasKey = (s.api_key?.length > 10) ? '✓ Key set' : '✗ api_key empty!';
    console.log(`  ${i+1}. [${(s.platform||'').toUpperCase()}] ${s.name}  |  shop_id: ${s.shop_id || s.campaign_id || 'N/A'}  |  ${hasKey}`);
  });
  console.log('');

  // 45-day deep scan
  const dateFromMs = Date.now() - (45 * 24 * 60 * 60 * 1000);
  console.log(`[INFO] Syncing last 45 days (from ${new Date(dateFromMs).toISOString().split('T')[0]})\n`);

  let totalInserted = 0, successCount = 0, failCount = 0;
  const summaryLog = [];

  for (const store of allStores) {
    const platform = String(store.platform || '').toLowerCase();
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[STORE] ${store.name} (${platform.toUpperCase()})`);

    // ✅ Get API key DIRECTLY from Supabase DB — no GitHub secrets needed
    const apiKey = store.api_key?.trim();
    if (!apiKey || apiKey.length < 10) {
      const msg = 'api_key is empty. Go to Supabase → marketplace_stores → set api_key for this store.';
      console.error(`  [SKIP] ${msg}`);
      await updateSyncStatus(store.id, 'NO_KEY', msg);
      failCount++;
      summaryLog.push({ store: store.name, status: 'SKIP', reason: msg });
      continue;
    }

    let orders = [];
    let syncError = null;

    try {
      if (platform === 'uzum') {
        orders = await syncUzumStore(store, apiKey, dateFromMs);
      } else if (platform === 'yandex') {
        orders = await syncYandexStore(store, apiKey, dateFromMs, rubToUzsRate);
      } else {
        console.warn(`  [SKIP] Unknown platform: ${store.platform}`);
        continue;
      }
    } catch (err) {
      syncError = err.message || String(err);
      console.error(`  [ERROR] ${syncError}`);
    }

    if (orders.length > 0 && !syncError) {
      console.log(`  [DB] Upserting ${orders.length} orders into marketplace_orders...`);
      const BATCH = 200;
      const batchErrors = [];
      for (let i = 0; i < orders.length; i += BATCH) {
        const { error } = await supabase
          .from('marketplace_orders')
          .upsert(orders.slice(i, i + BATCH), { onConflict: 'store_id,external_order_id' });
        if (error) { batchErrors.push(error.message); console.error('  [DB ERROR]', error.message); }
      }
      if (batchErrors.length > 0) {
        syncError = batchErrors.join('; ');
        await updateSyncStatus(store.id, 'ERROR', syncError);
        failCount++;
        summaryLog.push({ store: store.name, status: 'ERROR', orders: orders.length, reason: syncError });
      } else {
        totalInserted += orders.length;
        successCount++;
        await updateSyncStatus(store.id, 'SUCCESS', null);
        summaryLog.push({ store: store.name, status: 'SUCCESS', orders: orders.length });
        console.log(`  [OK] ✅ ${orders.length} orders synced → SUCCESS`);
      }
    } else if (syncError) {
      await updateSyncStatus(store.id, 'ERROR', syncError);
      failCount++;
      summaryLog.push({ store: store.name, status: 'ERROR', orders: 0, reason: syncError });
    } else {
      await updateSyncStatus(store.id, 'SUCCESS', null);
      successCount++;
      summaryLog.push({ store: store.name, status: 'SUCCESS', orders: 0 });
      console.log(`  [OK] ✅ 0 orders in period (store may be new/inactive) → SUCCESS`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[DONE] Sync complete in ${elapsed}s`);
  console.log(`       Stores processed: ${allStores.length}`);
  console.log(`       Success: ${successCount} | Failed: ${failCount}`);
  console.log(`       Orders inserted/updated: ${totalInserted}`);
  console.log(`       Exchange rate: 1 RUB = ${rubToUzsRate} UZS`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('Per-store summary:');
  summaryLog.forEach(s => {
    const icon = s.status === 'SUCCESS' ? '✅' : '❌';
    const detail = s.status === 'SUCCESS' ? `${s.orders} orders` : s.reason;
    console.log(`  ${icon} ${s.store}: ${detail}`);
  });

  if (failCount > 0) process.exit(1);
}

runSync().catch(err => {
  console.error('[UNHANDLED]', err);
  process.exit(1);
});
