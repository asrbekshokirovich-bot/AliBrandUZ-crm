import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing credentials in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  console.log("Checking marketplace_stores...");
  const { data: stores, error: e1 } = await supabase.from('marketplace_stores').select('*').limit(1);
  if (e1) console.error("Error stores:", e1);
  else console.log('Stores Columns:', Object.keys(stores[0] || {}));

  console.log("\nChecking marketplace_orders...");
  const { data: orders, error: e2 } = await supabase.from('marketplace_orders').select('*').limit(1);
  if (e2) console.error("Error orders:", e2);
  else console.log('Orders Columns:', Object.keys(orders[0] || {}));
}

check();
