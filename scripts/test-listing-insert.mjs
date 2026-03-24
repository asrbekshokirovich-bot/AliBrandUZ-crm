// Test with timestamps to fix NOT NULL constraint
const TOKEN = 'sbp_9ed043648277b8c9d9e943f5cfa58517e70619f2';
const REF = 'ybtfepdqzbgmtlsiisvp';
const SUPABASE_URL = `https://${REF}.supabase.co`;

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`,{headers:{Authorization:`Bearer ${TOKEN}`}})).json();
const SVC = keys.find(k=>k.name==='service_role').api_key;
const h = {apikey:SVC, Authorization:`Bearer ${SVC}`, 'Content-Type':'application/json', Prefer:'return=minimal'};

const STORE_ID = 'b19ef650-998e-4bc1-ba7b-12bb5753cc0e';
const now = new Date().toISOString();

// Try with created_at
console.log('Test: adding created_at...');
const r1 = await fetch(`${SUPABASE_URL}/rest/v1/marketplace_listings`, {
  method:'POST', headers:h, body:JSON.stringify({
    store_id: STORE_ID, external_sku: 'TEST_TS_1',
    external_product_id: 'TEST_P1', title: 'Test',
    price: 100000, status: 'active', stock: 5, stock_fbs: 5, stock_fbu: 0,
    fulfillment_type: 'fbs', last_synced_at: now, created_at: now, updated_at: now,
    category_title: 'Test', product_rank: 'A', moderation_status: 'APPROVED'
  })
});
const e1 = await r1.text();
console.log('['+r1.status+']', e1 || 'SUCCESS with timestamps!');

if (r1.status === 400) {
  const err = JSON.parse(e1);
  if (err.code === 'PGRST204') {
    // Column not found, try without created_at/updated_at
    console.log('Column '+err.message+' not found, checking DB...');
    
    // Fix: add DEFAULT NOW() to any timestamp columns without defaults via management API
    const fixSql = `
      ALTER TABLE marketplace_listings 
        ALTER COLUMN created_at SET DEFAULT NOW(),
        ALTER COLUMN updated_at SET DEFAULT NOW();
    `;
    const bytes = new TextEncoder().encode(JSON.stringify({query: fixSql.replace(/\n/g,' ')}));
    const fr = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method:'POST',
      headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},
      body: bytes
    });
    console.log('Fix applied ['+fr.status+']:', await fr.text());
  }
} else if (r1.status === 201) {
  console.log('FIXED! created_at was the missing field');
  
  // The real fix: add DEFAULT NOW() so edge functions don't need to include it
  const fixResult = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method:'POST',
    headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},
    body: JSON.stringify({query: "ALTER TABLE marketplace_listings ALTER COLUMN created_at SET DEFAULT NOW(); ALTER TABLE marketplace_listings ALTER COLUMN updated_at SET DEFAULT NOW();"})
  });
  console.log('DB fix applied:', fixResult.status);
  
  // Cleanup test row
  await fetch(`${SUPABASE_URL}/rest/v1/marketplace_listings?external_sku=eq.TEST_TS_1`,{method:'DELETE',headers:h});
  console.log('Test row cleaned up');
  console.log('\n✅ Now the edge function sync should work!');
}
