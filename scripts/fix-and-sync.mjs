// Fix marketplace_listings schema and run full sync
const TOKEN = 'sbp_9ed043648277b8c9d9e943f5cfa58517e70619f2';
const REF = 'ybtfepdqzbgmtlsiisvp';
const URL = `https://${REF}.supabase.co`;

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`,{headers:{Authorization:`Bearer ${TOKEN}`}})).json();
const SVC = keys.find(k=>k.name==='service_role').api_key;
const h = {apikey:SVC,Authorization:`Bearer ${SVC}`,'Content-Type':'application/json'};

// 1. Set DEFAULT 'uzum' for marketplace column (so edge function doesn't need to include it)
const fixSql = `ALTER TABLE marketplace_listings ALTER COLUMN marketplace SET DEFAULT 'uzum'; UPDATE marketplace_listings SET marketplace = 'uzum' WHERE marketplace IS NULL;`;
const fb = new TextEncoder().encode(JSON.stringify({query: fixSql}));
const fr = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method:'POST', headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'}, body:fb
});
console.log(`Fix marketplace DEFAULT [${fr.status}]:`, await fr.text());

// 2. Test insert works now (without specifying marketplace)
const tr = await fetch(`${URL}/rest/v1/marketplace_listings`, {
  method:'POST',
  headers:{...h, Prefer:'return=minimal'},
  body: JSON.stringify({
    store_id: 'b19ef650-998e-4bc1-ba7b-12bb5753cc0e',
    external_sku: 'VERIFY_TEST_SKU',
    external_product_id: 'VP1',
    title: 'Test',
    price: 100000,
    status: 'active',
    stock: 5,
    stock_fbs: 5,
    stock_fbu: 0,
    fulfillment_type: 'fbs',
    last_synced_at: new Date().toISOString(),
    category_title: 'Test',
    product_rank: 'A'
  })
});
if (tr.status === 201) {
  console.log('✅ Insert test: SUCCESS! Schema fix confirmed.');
  await fetch(`${URL}/rest/v1/marketplace_listings?external_sku=eq.VERIFY_TEST_SKU`, {method:'DELETE',headers:h});
} else {
  const err = await tr.json();
  console.error(`❌ Still failing [${tr.status}]:`, err.message?.slice(0,200));
  process.exit(1);
}

// 3. Sync ALL active Uzum stores
console.log('\nSyncing all Uzum stores...');
const stores = await (await fetch(`${URL}/rest/v1/marketplace_stores?select=id,name&platform=eq.uzum&is_active=eq.true&order=name`,{headers:h})).json();
console.log(`Found ${stores.length} stores`);

let totalSynced = 0, totalFailed = 0;
for (const s of stores) {
  process.stdout.write(`  Syncing ${s.name}...`);
  const r = await fetch(`${URL}/functions/v1/uzum-products`, {
    method:'POST', headers:h,
    body: JSON.stringify({action:'sync', store_id: s.id})
  });
  const d = await r.json();
  const synced = d.synced || 0;
  const failed = d.failed || 0;
  totalSynced += synced;
  totalFailed += failed;
  console.log(` [${r.status}] synced:${synced} failed:${failed} total:${d.total_skus}`);
}

// 4. Final count
const cnt = await fetch(`${URL}/rest/v1/marketplace_listings?select=id&limit=0`, {
  headers:{...h,'Range':'0-0','Prefer':'count=exact'}
});
const countRange = cnt.headers.get('content-range');
console.log(`\n✅ DONE! Total listings: ${countRange}`);
console.log(`   Synced: ${totalSynced} | Failed: ${totalFailed}`);
