import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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

const client = createClient(supabaseUrl, anonKey);

async function checkHealth() {
  const { data, error } = await client.functions.invoke('marketplace-health', {
    body: {},
  });
  
  if (error) {
    writeFileSync('tmp-failures.json', JSON.stringify({ error }, null, 2));
    return;
  }
  
  const failures = (data?.stores || []).filter((s: any) => !s.api_connected);
  writeFileSync('tmp-failures.json', JSON.stringify(failures, null, 2));
}

checkHealth();
