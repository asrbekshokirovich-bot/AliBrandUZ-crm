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

async function checkMarch27() {
  const { data, error } = await client
    .from('marketplace_orders')
    .select('id, ordered_at, total_amount, status, store_id')
    .gte('ordered_at', '2026-03-27T00:00:00Z')
    .lt('ordered_at', '2026-03-28T00:00:00Z');

  if (error) {
    console.error("Error fetching data:", error);
  } else {
    console.log(`Found ${data?.length || 0} orders for March 27th.`);
    if (data && data.length > 0) {
      const stats = data.reduce((acc, o) => {
        const st = (o.status || '').toUpperCase();
        acc.total += o.total_amount || 0;
        if (['CANCELLED','CANCELED','REJECTED','NOT_','CANCEL'].some(s => st.includes(s))) acc.cancelled += o.total_amount || 0;
        else if (st.includes('RETURN')) acc.returned += o.total_amount || 0;
        else acc.active += o.total_amount || 0;
        return acc;
      }, { total: 0, active: 0, cancelled: 0, returned: 0 });
      console.log("Stats:", stats);
      console.log("Sample statuses:", [...new Set(data.map(o => o.status))]);
    }
  }
}

checkMarch27();
