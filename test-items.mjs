import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
let url = '', key = '', serviceKey = '';
envFile.split(/\r?\n/).forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) url = line.substring('VITE_SUPABASE_URL='.length).replace(/"/g, '').trim();
  if(line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.substring('VITE_SUPABASE_PUBLISHABLE_KEY='.length).replace(/"/g, '').trim();
  if(line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.substring('SUPABASE_SERVICE_ROLE_KEY='.length).replace(/"/g, '').trim();
});

async function run() {
  const res = await fetch(`${url}/rest/v1/marketplace_orders?select=items&limit=10&status=eq.DELIVERED`, {
    headers: { apikey: serviceKey || key, 'Authorization': `Bearer ${serviceKey || key}` }
  });
  
  const json = await res.json();
  console.log("BODY:", JSON.stringify(json, null, 2));
}
run();
