import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
let url = '', key = '', serviceKey = '';
envFile.split(/\r?\n/).forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) url = line.substring('VITE_SUPABASE_URL='.length).replace(/"/g, '').trim();
  if(line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.substring('VITE_SUPABASE_PUBLISHABLE_KEY='.length).replace(/"/g, '').trim();
  if(line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.substring('SUPABASE_SERVICE_ROLE_KEY='.length).replace(/"/g, '').trim();
});

async function run() {
  const d = new Date();
  d.setMonth(d.getMonth() - 2); // get last 2 months

  const res = await fetch(`${url}/rest/v1/rpc/get_top_marketplace_products`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'apikey': serviceKey || key, 
      'Authorization': `Bearer ${serviceKey || key}` 
    },
    body: JSON.stringify({
      p_start_date: d.toISOString(),
      p_end_date: new Date().toISOString(),
      p_platform: null,
      p_store_id: null
    })
  });
  
  if (!res.ok) {
     console.log("ERROR:", await res.text());
  } else {
     const json = await res.json();
     console.log("SUCCESS, rows:", json.length);
     console.log("FIRST ROW:", JSON.stringify(json[0], null, 2));
  }
}
run();
