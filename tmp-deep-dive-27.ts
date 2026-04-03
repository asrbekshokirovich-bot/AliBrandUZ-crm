import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let envText = '';
if (existsSync(join(process.cwd(), '.env'))) envText += readFileSync(join(process.cwd(), '.env'), 'utf-8') + '\n';
if (existsSync(join(process.cwd(), '.env.local'))) envText += readFileSync(join(process.cwd(), '.env.local'), 'utf-8');

const envConfig: Record<string, string> = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) envConfig[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
});

const supabaseUrl = envConfig['VITE_SUPABASE_URL'] || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const anonKey = envConfig['VITE_SUPABASE_PUBLISHABLE_KEY'];

const client = createClient(supabaseUrl, anonKey);

async function deepDive() {
  const { data: stores } = await client.from('marketplace_stores').select('id, name, is_active');
  const storeMap = stores?.reduce((acc: any, s) => { acc[s.id] = s; return acc; }, {});

  const { data: orders } = await client
    .from('marketplace_orders')
    .select('store_id, total_amount, status')
    .gte('ordered_at', '2026-03-27T00:00:00Z')
    .lt('ordered_at', '2026-03-28T00:00:00Z');

  if (!orders) { console.log("No orders found"); return; }

  const grouped: Record<string, any> = {};
  for (const o of orders) {
    if (!grouped[o.store_id]) grouped[o.store_id] = { name: storeMap[o.store_id]?.name || 'Unknown', active: storeMap[o.store_id]?.is_active, stats: {} };
    const st = o.status || 'NULL';
    grouped[o.store_id].stats[st] = (grouped[o.store_id].stats[st] || 0) + (o.total_amount || 0);
  }
  console.log(JSON.stringify(grouped, null, 2));
}

deepDive();
