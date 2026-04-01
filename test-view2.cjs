const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL="?(https:\/\/[^\s"]+)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY="?([a-zA-Z0-9.\-_]+)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function check() {
  const { data, error } = await supabase.from('marketplace_finance_summary')
    .select('store_id, gross_revenue, commission_total, delivery_fees, storage_fees, net_revenue, period_date, currency')
    .limit(1);
    
  console.log("DATA:", data);
  console.log("ERROR:", error);
}

check();
