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

const adminClient = createClient(envConfig['VITE_SUPABASE_URL'], envConfig['SUPABASE_SERVICE_ROLE_KEY']);

async function testInsert() {
  const dummyOrder = {
    store_id: 'e6d7797e-f677-467e-9d95-9cc5cfcf070c',
    external_order_id: 'test-12345',
    status: 'CREATED',
    fulfillment_status: 'pending',
    total_amount: 1000,
    currency: 'UZS',
    items: [],
    ordered_at: new Date().toISOString()
  };

  console.log('Inserting dummy order...', dummyOrder);
  const { data, error } = await adminClient
    .from('marketplace_orders')
    .upsert(dummyOrder, { onConflict: 'store_id,external_order_id' });

  if (error) {
    console.error('Insert Error:', JSON.stringify(error, null, 2));
  } else {
    console.log('Insert Success:', data);
    // Cleanup
    await adminClient.from('marketplace_orders').delete().eq('external_order_id', 'test-12345');
  }
}

testInsert();
