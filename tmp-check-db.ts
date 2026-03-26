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

const supabaseUrl = envConfig['VITE_SUPABASE_URL'];
const adminKey = envConfig['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !adminKey) {
  console.log('Missing Supabase Service Key in .env');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, adminKey);

async function check() {
  console.log('Querying marketplace_orders with Service Role Key (Bypass RLS):');
  const { count, error } = await adminClient.from('marketplace_orders').select('*', { count: 'exact', head: true });
  console.log('Admin Orders Count:', count, error?.message || '');
  
  console.log('Querying marketplace_stores with Service Role Key:');
  const { count: storesCount, error: storesError } = await adminClient.from('marketplace_stores').select('*', { count: 'exact', head: true });
  console.log('Admin Stores Count:', storesCount, storesError?.message || '');
}
check();
