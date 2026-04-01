const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
let url = '', key = '';
envFile.split('\n').forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].replace(/"/g, '').trim();
  if(line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].replace(/"/g, '').trim();
});

async function run() {
  const res = await fetch(`${url}/rest/v1/marketplace_finance_summary?select=storage_fees&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const text = await res.text();
  console.log("STATUS:", res.status);
  console.log("BODY:", text);
}
run();
