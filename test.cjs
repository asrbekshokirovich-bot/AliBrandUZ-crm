const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function run() {
  const res = await supabase.from('products').select('id', { count: 'exact', head: true })
    .neq('status', 'archived')
    .neq('source', 'marketplace_auto')
    .or('tashkent_manual_stock.is.null,tashkent_manual_stock.eq.0');
  
  console.log('QUERY RES:', res);
}

run();
