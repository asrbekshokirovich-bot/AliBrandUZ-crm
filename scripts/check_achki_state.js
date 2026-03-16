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
  const productId = 'e038d2ff-b235-4b0b-b6da-d4e8f1732730'; // Achki product ID
  
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  console.log("--- PRODUCT ---");
  const pUrl = `${supabaseUrl}/rest/v1/products?id=eq.${productId}`;
  const pResp = await fetch(pUrl, { headers });
  const p = (await pResp.json())[0];
  console.log(`Product: price=${p.price}, cost_price=${p.cost_price}, currency=${p.purchase_currency}`);

  console.log("\n--- VARIANTS ---");
  const variantsUrl = `${supabaseUrl}/rest/v1/product_variants?product_id=eq.${productId}`;
  const vResp = await fetch(variantsUrl, { headers });
  const variants = await vResp.json();
  
  for (const v of variants || []) {
    console.log(`Variant ${v.sku} : price=${v.price}, cost_price=${v.cost_price}, currency=${v.cost_price_currency}`);
  }
}

run();
