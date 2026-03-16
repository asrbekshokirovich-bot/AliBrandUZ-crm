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
  const productId = 'e038d2ff-b235-4b0b-b6da-d4e8f1732730';
  
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  const variantsUrl = `${supabaseUrl}/rest/v1/product_variants?product_id=eq.${productId}`;
  const vResp = await fetch(variantsUrl, { headers });
  const variants = await vResp.json();
  
  console.log("Variants found:", variants?.length);
  for (const v of variants || []) {
    console.log(`- ${v.sku} | Cost: ${v.cost_price} | Currency: ${v.cost_price_currency}`);
    if (v.cost_price > 1000 && v.cost_price_currency === 'CNY') {
      const pUrl = `${supabaseUrl}/rest/v1/product_variants?id=eq.${v.id}`;
      await fetch(pUrl, { method: 'PATCH', headers, body: JSON.stringify({ cost_price_currency: 'UZS' }) });
      console.log(`  -> Fixed variance currency`);
    }
  }

  const itemsUrl = `${supabaseUrl}/rest/v1/product_items?product_id=eq.${productId}`;
  const iResp = await fetch(itemsUrl, { headers });
  const items = await iResp.json();
  
  console.log("Items found:", items?.length);
  let fixedItems = 0;
  for (const i of items || []) {
    if (i.unit_cost > 1000 && i.unit_cost_currency === 'CNY') {
      const pUrl = `${supabaseUrl}/rest/v1/product_items?id=eq.${i.id}`;
      await fetch(pUrl, { method: 'PATCH', headers, body: JSON.stringify({ unit_cost_currency: 'UZS' }) });
      fixedItems++;
    }
  }
  console.log(`Fixed ${fixedItems} items currency.`);
}

run();
