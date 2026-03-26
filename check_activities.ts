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

async function main() {
  const tables = [
    'tracking_events',
    'inventory_movements',
    'direct_sales',
    'finance_transactions',
    'excel_import_logs',
    'tasks',
    'verification_sessions',
    'defect_claims',
    'stock_alerts'
  ];

  console.log("Checking row counts for Activity tables...");
  
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`- ${table}: ERROR (${error.message})`);
    } else {
      console.log(`- ${table}: ${count} rows`);
    }
  }
}

main().catch(console.error);
