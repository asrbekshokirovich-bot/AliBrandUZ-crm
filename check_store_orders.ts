import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStoreOrders() {
  console.log("Checking store_orders table...");
  const { data, error } = await supabase.from('store_orders').select('*').limit(1);
  if (error) {
    console.log(`ERROR: ${error.message}`);
  } else {
    console.log(`Success: Found ${data?.length} rows in store_orders.`);
  }
}

checkStoreOrders().catch(console.error);
