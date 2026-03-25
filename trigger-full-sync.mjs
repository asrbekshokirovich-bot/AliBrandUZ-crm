const url = "https://ybtfepdqzbgmtlsiisvp.supabase.co/functions/v1/full-resync";
const key = "sb_secret_wc9DpbY-k9adrTmDysNrMw_RWWPK2fY";

async function invoke(phase, extra = {}) {
  console.log(`Invoking phase: ${phase}...`, extra.store_id || "");
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({ phase, ...extra })
  });
  return res.json();
}

async function run() {
  // 1. List stores
  const { stores } = await invoke('list_stores');
  console.log(`Found ${stores?.length} active stores.`);

  // 2. Sync orders for each store
  for (const store of stores || []) {
    console.log(`Syncing ${store.name} (${store.platform})...`);
    const result = await invoke('sync_orders', { store_id: store.id, startDate: '2026-03-01' });
    console.log(`Result:`, JSON.stringify(result, null, 2));
  }

  // 3. Final status
  const finalStatus = await invoke('status');
  console.log(`Final Status:`, JSON.stringify(finalStatus, null, 2));
}

run().catch(console.error);
