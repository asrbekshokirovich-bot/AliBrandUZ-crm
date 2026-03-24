/**
 * Seed marketplace stores — corrected secret names matching DB
 * Run: node scripts/seed-stores.mjs
 */
const TOKEN = 'sbp_9ed043648277b8c9d9e943f5cfa58517e70619f2';
const REF   = 'ybtfepdqzbgmtlsiisvp';
const SUPABASE_URL = `https://${REF}.supabase.co`;

const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` }
});
const keys = await keysRes.json();
const SVC_KEY = keys.find(k => k.name === 'service_role')?.api_key;
if (!SVC_KEY) { console.error('Cannot get service role key'); process.exit(1); }
console.log('Service role key: OK');

// Correct secret names from DB verification
const secrets = [
  { name: 'UZUM_ALI_BRAND_MARKET_API_KEY', value: 'q76imT5nndH+6ti71ilympxn9mAedVsqsm/aBAoPIL4=' },
  { name: 'UZUM_ATLAS_MARKET_API_KEY',     value: '7O4XDI8UrwX6ClblrSenJFGdQD5RjUax9sns32ZkHS8=' },
  { name: 'UZUM_CHINA_MARKET_API_KEY',     value: 'JLkRSXK4ci6SVZhrjPfaoKrWFwgXEBaPmTO0Ygk3mLg=' },
  { name: 'UZUM_XIT_MARKET_API_KEY',       value: 'ng9XFUFejJqrgYkhHyBJCnZWBZG12lfX2oziLHx3Ddk=' },
  { name: 'UZUM_ATLAS_MARKET_2_API_KEY',   value: '46043gptOo1U9FIc0FdADEz+c4pcn0L7dGapoAMwZG8=' },
  { name: 'UZUM_BM_STORE_API_KEY',         value: 'YPx9qC3uMrSP08WUxKRJV5RCaYyMchNyXUf84KqCytA=' },
  { name: 'UZUM_BM_STORE_2_API_KEY',       value: '0pEgVd3FrJo/E3SkR2XEMHUDEsMWJvOblkq9vJ6nPDU=' },
  { name: 'UZUM_ALIBRAND_MARKET_API_KEY',  value: 'bqgINKUp1/jdqDr8R8ms59mRxsw8xY5pXNDTxkHYYQs=' },
];

// Set secrets
console.log('\nSetting secrets...');
const secRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(secrets)
});
console.log('Secrets:', secRes.ok ? `OK (${secrets.length} keys set)` : `ERROR ${secRes.status}`);

// Add missing Alibrand.Market store (shop 92815)
console.log('\nAdding Alibrand.Market...');
const storeRes = await fetch(`${SUPABASE_URL}/rest/v1/marketplace_stores`, {
  method: 'POST',
  headers: {
    apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal,resolution=ignore-duplicates'
  },
  body: JSON.stringify({
    name: 'Alibrand.Market', platform: 'uzum',
    shop_id: '92815', seller_id: '92815',
    api_key_secret_name: 'UZUM_ALIBRAND_MARKET_API_KEY',
    is_active: true, fulfillment_type: 'fbs'
  })
});
console.log('Alibrand.Market:', storeRes.status, storeRes.status === 201 ? 'Added' : await storeRes.text());

// Verify
console.log('\nVerifying...');
const finalRes = await fetch(
  `${SUPABASE_URL}/rest/v1/marketplace_stores?select=name,shop_id,api_key_secret_name&platform=eq.uzum&order=name`,
  { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } }
);
const rows = await finalRes.json();
console.log(`Total Uzum stores: ${rows.length}`);
rows.forEach(r => console.log(`  [OK] ${r.name} | shop:${r.shop_id} | key:${r.api_key_secret_name}`));
console.log('\nDone!');
