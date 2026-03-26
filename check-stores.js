import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('Missing env variables');
  process.exit(1);
}

// 1. Check with ANON KEY (simulates what UI does with RLS, though we don't have an auth token here)
const supabaseAnon = createClient(url, key);
console.log('--- Testing with ANON KEY (RLS Applies) ---');
const { data: anonData, error: anonError } = await supabaseAnon.from('marketplace_stores').select('id, name').limit(5);
console.log('Anon Error:', anonError);
console.log('Anon Data Count:', anonData?.length);

// 2. Check with SERVICE ROLE KEY (Bypasses RLS to see actual physical rows)
if (serviceKey) {
  console.log('\n--- Testing with SERVICE ROLE KEY (Bypasses RLS) ---');
  const supabaseAdmin = createClient(url, serviceKey);
  const { data: adminData, error: adminError } = await supabaseAdmin.from('marketplace_stores').select('id, name');
  console.log('Admin Error:', adminError);
  console.log('ACTUAL STORES IN DATABASE:', adminData?.length);
  if (adminData?.length > 0) {
    console.log('Store names:', adminData.map(s => s.name).join(', '));
  }
} else {
  console.log('\nNO SERVICE ROLE KEY FOUND, cannot bypass RLS to verify physical data.');
}
