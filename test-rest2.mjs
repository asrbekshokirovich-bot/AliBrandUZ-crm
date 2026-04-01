import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf-8');
let url = '', key = '';
envFile.split(/\r?\n/).forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) url = line.substring('VITE_SUPABASE_URL='.length).replace(/"/g, '').trim();
  if(line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.substring('VITE_SUPABASE_ANON_KEY='.length).replace(/"/g, '').trim();
});

async function run() {
  console.log("Checking URL:", url);
  if (!url || !key) return console.error('MISSING ENV!');
  
  const res = await fetch(`${url}/rest/v1/marketplace_finance_summary?select=store_id,gross_revenue,commission_total,delivery_fees,storage_fees,net_revenue,period_date,currency&limit=1`, {
    headers: { apikey: key, 'Authorization': `Bearer ${key}` }
  });
  
  const text = await res.text();
  console.log("STATUS:", res.status);
  console.log("BODY:", text);
}
run();
