// Fix api_key_secret_name in marketplace_stores to match exact GitHub Secret names
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Maps store name (or partial match) → exact GitHub Secret name
// These secret names come from the user's GitHub Settings → Secrets screenshots
const SECRET_MAP = [
  // Uzum stores
  { match: 'ALI BRAND MARKET',       secret: 'UZUM_ALI_BRAND_MARKET_API_KEY' },
  { match: 'Atlas Market',           secret: 'UZUM_ATLAS_Market_API_KEY' },
  { match: 'Uzum China Market',      secret: 'UZUM_CHINA_MARKET_API_KEY' },
  { match: 'Xit market',             secret: 'UZUM_XIT_MARKET_API_KEY' },
  { match: 'Atlas.Market',           secret: 'UZUM_Atlas_Market_API_KEY' },
  { match: 'BM Store',               secret: 'UZUM_BM_STORE_API_KEY' },
  { match: 'BM_store',               secret: 'UZUM_BMSTORE_API_KEY' },
  { match: 'Alibrand.Market',        secret: 'UZUM_Alibrand_Market_API_KEY' },
  { match: 'Zamona',                 secret: 'UZUM_Zamona_Market_API_KEY' },
  { match: 'Velina',                 secret: 'UZUM_Velina_Store_API_KEY' },
  { match: 'Ali brand women',        secret: 'UZUM_Velina_Store_API_KEY' },
  // Yandex stores
  { match: 'FBY - AliBrand',         secret: 'YANDEX_FBY_AliBrand_Market_API_KEY' },
  { match: 'FBS - Atlas',            secret: 'YANDEX_FBS_Atlas_Market_API_KEY' },
  { match: 'FBS - BM',               secret: 'YANDEX_FBS_BM_Store2_API_KEY' },
  { match: 'FBY - BM',               secret: 'YANDEX_FBY_BM_Store3_API_KEY' },
];

async function fixSecretNames() {
  console.log('Loading all stores from Supabase...');
  const { data: stores, error } = await supabase
    .from('marketplace_stores')
    .select('id, name, platform, api_key_secret_name');

  if (error) { console.error('DB error:', error); process.exit(1); }
  
  console.log(`Found ${stores.length} stores:\n`);

  for (const store of stores) {
    // Find the matching secret from our map
    const mapping = SECRET_MAP.find(m => 
      store.name?.toLowerCase().includes(m.match.toLowerCase())
    );

    if (!mapping) {
      console.log(`  [?] "${store.name}" — no mapping found, skipping`);
      continue;
    }

    if (store.api_key_secret_name === mapping.secret) {
      console.log(`  [=] "${store.name}" — already correct: ${mapping.secret}`);
      continue;
    }

    console.log(`  [→] "${store.name}"`);
    console.log(`      OLD: ${store.api_key_secret_name || 'NULL'}`);
    console.log(`      NEW: ${mapping.secret}`);

    const { error: updateErr } = await supabase
      .from('marketplace_stores')
      .update({ api_key_secret_name: mapping.secret, updated_at: new Date().toISOString() })
      .eq('id', store.id);

    if (updateErr) {
      console.error(`  [!] Update failed:`, updateErr);
    } else {
      console.log(`      ✓ Updated`);
    }
  }

  console.log('\nDone! All api_key_secret_name values now match GitHub Secrets.');
  console.log('Trigger the GitHub Action to sync data now.');
}

fixSecretNames().catch(console.error);
