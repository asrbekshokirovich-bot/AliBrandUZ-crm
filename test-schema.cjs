const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL="?(https:\/\/[^\s"]+)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY="?([a-zA-Z0-9.\-_]+)/);

if (!urlMatch || !keyMatch) {
  process.exit(1);
}
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase.from('marketplace_orders').select('*').limit(1);
  console.log(error || Object.keys(data[0] || {}));
}
run();
