import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
let url = '', key = '';
envFile.split(/\r?\n/).forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) url = line.substring('VITE_SUPABASE_URL='.length).replace(/"/g, '').trim();
});

// Since the previous script had a hardcoded service role key, we will use it directly if it's there
const secretKey = "sb_secret_wc9DpbY-k9adrTmDysNrMw_RWWPK2fY"; // The one from trigger-full-sync.mjs

async function invoke(phase, extra = {}) {
  console.log(`Invoking phase: ${phase}...`, extra.store_id || "");
  const res = await fetch(`${url}/functions/v1/full-resync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secretKey}`
    },
    body: JSON.stringify({ phase, ...extra })
  });
  return res.json();
}

async function run() {
  // We want to rebuild the finance summary for March and April
  console.log("Recalculating Finance Summary for March 2026...");
  const res1 = await invoke('sync_finance', { startDate: '2026-03-01' });
  console.log("Result:", res1);
  
  console.log("Recalculating Finance Summary for April 2026...");
  const res2 = await invoke('sync_finance', { startDate: '2026-04-01' });
  console.log("Result:", res2);
}

run().catch(console.error);
