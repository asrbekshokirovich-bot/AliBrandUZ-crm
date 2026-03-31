import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ybtfepdqzbgmtlsiisvp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlidGZlcGRxemJnbXRsc2lpc3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzk2OTksImV4cCI6MjA4OTYxNTY5OX0.snBdoxPEfKhSxQrwBC3v8OgOCiuOFx8P1ESy_Cyshpc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkStores() {
  console.log('Fetching active stores...');
  
  // Actually anon key won't work to get all stores if not logged in. Let's use the 'check-stores' Edge function or list_stores from full-resync!
  // Wait, I saw trigger-full-sync.mjs uses /functions/v1/full-resync with a service key to list_stores!
  
  const res = await fetch(SUPABASE_URL + '/functions/v1/full-resync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sb_secret_wc9DpbY-k9adrTmDysNrMw_RWWPK2fY'
    },
    body: JSON.stringify({ phase: 'list_stores' })
  });
  
  if (!res.ok) {
     console.log('full-resync returned:', await res.text());
     return;
  }
  
  const data = await res.json();
  const stores = data.stores || [];
  console.log(`Found ${stores.length} active stores`);
  
  const brokenKeys = [];
  const workingKeys = [];

  for (const store of stores) {
    try {
      console.log(`Checking ${store.name} (${store.platform})...`);
      let fnName = store.platform === 'uzum' ? 'uzum-diagnostic' : 'yandex-orders'; // Fallback to fetching orders for yandex to test key
      const action = store.platform === 'uzum' ? 'check' : 'sync';
      
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(fnName, {
        body: store.platform === 'uzum' ? { store_id: store.id, action: action } : { store_id: store.id, action: action, lightweight: true, days: 1 }
      });
      
      if (fnErr) {
          console.log(`❌ [FAIL] ${store.name} (${store.platform}): ${fnErr.message}`);
          brokenKeys.push({ name: store.name, platform: store.platform, reason: fnErr.message });
      } else if (fnData && fnData.success === false) {
          console.log(`❌ [FAIL] ${store.name} (${store.platform}): ${fnData.error}`);
          brokenKeys.push({ name: store.name, platform: store.platform, reason: fnData.error });
      } else {
          console.log(`✅ [OK] ${store.name} (${store.platform})`);
          workingKeys.push(store.name);
      }
    } catch (e) {
      console.log(`❌ [ERROR] ${store.name}: `, e.message);
      brokenKeys.push({ name: store.name, platform: store.platform, reason: e.message });
    }
  }
  
  console.log("\n====== RESULTS ======");
  console.log(`WORKING (${workingKeys.length}):`, workingKeys.join(', '));
  console.log(`BROKEN (${brokenKeys.length}):`);
  brokenKeys.forEach(b => console.log(`- ${b.name} (${b.platform}): ${b.reason}`));
}

checkStores().catch(console.error);
