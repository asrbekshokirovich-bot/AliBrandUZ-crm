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

async function checkMarch() {
  const { data, error } = await client
    .from('marketplace_orders')
    .select('id, ordered_at, total_amount, status, store_id')
    .gte('ordered_at', '2026-03-20T00:00:00Z')
    .lte('ordered_at', '2026-03-31T23:59:59Z')
    .order('ordered_at', { ascending: true });

  if (error) {
    console.error("Error fetching data:", error);
  } else {
    console.log(`Found ${data?.length || 0} orders in total for March 20-31.`);
    const daily = data?.reduce((acc: any, o) => {
      const d = (o.ordered_at || '').slice(0, 10);
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});
    console.log("Daily counts:", daily);
  }
}

checkMarch();
