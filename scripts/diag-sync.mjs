// Diagnose uzum-products sync failure
const TOKEN = 'sbp_9ed043648277b8c9d9e943f5cfa58517e70619f2';
const REF = 'ybtfepdqzbgmtlsiisvp';
const SUPABASE_URL = `https://${REF}.supabase.co`;

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`,{headers:{Authorization:`Bearer ${TOKEN}`}})).json();
const SVC = keys.find(k=>k.name==='service_role').api_key;
const h = {apikey:SVC, Authorization:`Bearer ${SVC}`, 'Content-Type':'application/json'};

// Get ALI BRAND MARKET store ID
const stores = await (await fetch(`${SUPABASE_URL}/rest/v1/marketplace_stores?select=id,name&platform=eq.uzum&name=eq.ALI BRAND MARKET`,{headers:h})).json();
const STORE_ID = stores[0]?.id;
console.log('Testing store:', stores[0]?.name, STORE_ID);

// Sync with action:list first to see product structure (no DB write)
console.log('\n1. Listing first 3 products...');
const listRes = await fetch(`${SUPABASE_URL}/functions/v1/uzum-products`, {
  method:'POST', headers:h,
  body:JSON.stringify({action:'list',store_id:STORE_ID,page:0,size:3})
});
const listData = await listRes.json();
console.log('List response ['+listRes.status+']:');
console.log('  Total products:', listData.total);
console.log('  Products count:', listData.products?.length || listData.data?.length);
if (listData.products?.[0]?.skus) {
  console.log('  First SKU:', JSON.stringify(listData.products[0].skus[0]).slice(0,200));
}

// Run sync and get full response
console.log('\n2. Running sync (action:sync)...');
const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/uzum-products`, {
  method:'POST', headers:h,
  body:JSON.stringify({action:'sync',store_id:STORE_ID,size:20})
});
const syncData = await syncRes.json();
console.log('Sync response ['+syncRes.status+']:');
console.log('  synced:', syncData.synced);
console.log('  failed:', syncData.failed);
console.log('  total_skus:', syncData.total_skus);
console.log('  Full:', JSON.stringify(syncData).slice(0,500));

// Check sync logs for error details
console.log('\n3. Checking sync logs...');
const logsRes = await fetch(`${SUPABASE_URL}/rest/v1/marketplace_sync_logs?select=*&store_id=eq.${STORE_ID}&order=started_at.desc&limit=3`,{headers:h});
const logs = await logsRes.json();
console.log('Logs response status:', logsRes.status);
if (Array.isArray(logs)) {
  logs.forEach(l => {
    console.log('  ['+l.status+'] error:', l.error_message, 'details:', JSON.stringify(l.error_details)?.slice(0,300));
  });
} else {
  console.log('Logs error:', JSON.stringify(logs).slice(0,200));
}
