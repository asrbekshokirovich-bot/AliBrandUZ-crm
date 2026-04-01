const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const lines = envFile.split('\n');
let url = '', key = '';
for(const line of lines) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].replace(/"/g, '').trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].replace(/"/g, '').trim();
}

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('marketplace_finance_summary')
    .select('store_id, gross_revenue, commission_total, delivery_fees, storage_fees, net_revenue, period_date, currency')
    .limit(1);
    
  console.log("DATA:", data);
  console.log("ERROR:", error);
}

test();
