import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('Missing env variables', { url: !!url, key: !!key });
  process.exit(1);
}

const supabaseAnon = createClient(url, key);
const run = async () => {
    console.log('--- Testing with ANON KEY (RLS Applies) ---');
    const { data: anonData, error: anonError } = await supabaseAnon.from('marketplace_stores').select('id, name');
    console.log('Anon Error:', anonError);
    console.log('Anon Data Count:', anonData?.length);

    if (serviceKey) {
      console.log('\n--- Testing with SERVICE KEY (Bypasses RLS) ---');
      const supabaseAdmin = createClient(url, serviceKey);
      const { data: adminData, error: adminError } = await supabaseAdmin.from('marketplace_stores').select('id, name');
      console.log('Admin Error:', adminError);
      console.log('ACTUAL STORES IN DATABASE:', adminData?.length);
      if (adminData?.length > 0) {
        console.log('Store names:', adminData.map(s => s.name).join(', '));
      }
    } else {
      console.log('\nNO SERVICE ROLE KEY FOUND. Attempting to get user session to check RLS.');
    }
}
run();
