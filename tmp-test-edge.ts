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

const client = createClient(envConfig['VITE_SUPABASE_URL'], envConfig['VITE_SUPABASE_PUBLISHABLE_KEY'] || envConfig['VITE_SUPABASE_ANON_KEY']);

async function testFunction() {
  console.log('Invoking uzum-orders directly for Xit market...');
  const { data, error } = await client.functions.invoke('uzum-orders', {
    body: { 
      store_id: 'e6d7797e-f677-467e-9d95-9cc5cfcf070c', // Xit market
      action: 'sync',
      lightweight: true // Try lightweight mode
    }
  });
  
  if (error) {
    console.error('Invoke Error:', error);
  } else {
    console.log('Invoke Data:', JSON.stringify(data, null, 2));
  }
}
testFunction();
