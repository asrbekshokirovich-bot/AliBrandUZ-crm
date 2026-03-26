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
const anonKey = envConfig['VITE_SUPABASE_PUBLISHABLE_KEY'];

if (!supabaseUrl || !anonKey) {
  console.log('Missing Supabase Keys in .env');
  process.exit(1);
}

const client = createClient(supabaseUrl, anonKey);

async function check() {
  console.log('Querying marketplace_stores with Anon Key:');
  const { data, error } = await client.from('marketplace_stores').select('*').eq('shop_id', '69508');
  console.log('Store:', JSON.stringify(data, null, 2), error?.message || '');
}
check();
