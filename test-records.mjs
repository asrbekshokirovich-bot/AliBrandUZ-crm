import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
let url = '', key = '';
envFile.split(/\r?\n/).forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) url = line.substring('VITE_SUPABASE_URL='.length).replace(/"/g, '').trim();
  if(line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.substring('VITE_SUPABASE_PUBLISHABLE_KEY='.length).replace(/"/g, '').trim();
});

async function run() {
  const res = await fetch(`${url}/rest/v1/marketplace_finance_summary?select=id&limit=5`, {
    headers: { apikey: key, 'Authorization': `Bearer ${key}` }
  });
  
  const text = await res.text();
  console.log("STATUS:", res.status);
  console.log("BODY:", text);
}
run();
