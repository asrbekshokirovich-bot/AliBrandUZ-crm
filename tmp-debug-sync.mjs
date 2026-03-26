import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

let envText = '';
if (existsSync('.env')) envText += readFileSync('.env', 'utf-8') + '\n';
if (existsSync('.env.local')) envText += readFileSync('.env.local', 'utf-8') + '\n';

const envConfig = {};
envText.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) envConfig[k.trim()] = v.join('=').trim().replace(/['"]/g, '');
});

const client = createClient(envConfig['VITE_SUPABASE_URL'], envConfig['VITE_SUPABASE_PUBLISHABLE_KEY']);

async function debugSync() {
    console.log("Checking marketplace_stores...");
    const { data: stores } = await client.from('marketplace_stores').select('id, name, platform, is_active');
    console.log("Stores:", stores);

    console.log("\nChecking marketplace_sync_logs...");
    const { data: logs } = await client
        .from('marketplace_sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5);
    console.log("Recent Sync Logs:", JSON.stringify(logs, null, 2));

    console.log("\nChecking marketplace_orders count...");
    const { count } = await client
        .from('marketplace_orders')
        .select('*', { count: 'exact', head: true });
    console.log("Total Orders in DB:", count);
}

debugSync().catch(console.error);
