import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(rawLine => {
  const line = rawLine.replace('\r', '');
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.substring(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
  if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) supabaseKey = line.substring(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
});

async function run() {
  const url = `${supabaseUrl}/rest/v1/products?name=ilike.*Achki*`;
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, { headers });
  const products = await response.json();
  
  if (!products || !Array.isArray(products)) {
    console.log("No Achki products found or error occurred:", products);
    return;
  }

  console.log("Found", products.length, "products.");
  
  for (const p of products) {
    console.log(`- ${p.name} (ID: ${p.id}) | Cost Price: ${p.cost_price} | Currency: ${p.purchase_currency}`);
    if (p.cost_price > 1000 && p.purchase_currency === 'CNY') {
      console.log(`  -> Fixing: Changing purchase_currency to UZS`);
      
      const patchUrl = `${supabaseUrl}/rest/v1/products?id=eq.${p.id}`;
      const patchResponse = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ purchase_currency: 'UZS' })
      });
      
      if (patchResponse.ok) {
        console.log(`  -> Updated successfully!`);
      } else {
        console.error(`  -> Failed to update:`, await patchResponse.text());
      }
    }
  }
}

run();
