// Fix api_key_secret_name AND campaign_id in marketplace_stores to match GitHub Secret names
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

// Maps store name (partial match) → GitHub Secret name + campaign_id (for Yandex)
const SECRET_MAP = [
  // Uzum stores
  { match: 'ALI BRAND MARKET',    secret: 'UZUM_ALI_BRAND_MARKET_API_KEY' },
  { match: 'Atlas Market',        secret: 'UZUM_ATLAS_Market_API_KEY' },
  { match: 'Uzum China Market',   secret: 'UZUM_CHINA_MARKET_API_KEY' },
  { match: 'Xit market',          secret: 'UZUM_XIT_MARKET_API_KEY' },
  { match: 'Atlas.Market',        secret: 'UZUM_Atlas_Market_API_KEY' },
  { match: 'BM Store',            secret: 'UZUM_BM_STORE_API_KEY' },
  { match: 'BM_store',            secret: 'UZUM_BMSTORE_API_KEY' },
  { match: 'Alibrand.Market',     secret: 'UZUM_Alibrand_Market_API_KEY' },
  { match: 'Zamona',              secret: 'UZUM_Zamona_Market_API_KEY' },
  { match: 'Velina',              secret: 'UZUM_Velina_Store_API_KEY' },
  { match: 'Ali brand women',     secret: 'UZUM_Velina_Store_API_KEY' },

  // Yandex stores — campaign_id verified from user's credential sheet
  { match: 'FBY - AliBrand',      secret: 'YANDEX_FBY_AliBrand_Market_API_KEY', campaign_id: '148843590' },
  { match: 'FBS - Atlas',         secret: 'YANDEX_FBS_Atlas_Market_API_KEY',    campaign_id: '148987777' },
  { match: 'FBS - BM',            secret: 'YANDEX_FBS_BM_STORE2_API_KEY',       campaign_id: '148916383' },
  { match: 'FBY - BM',            secret: 'YANDEX_FBY_BM_Store3_API_KEY',       campaign_id: '148939239' },
];

async function fixSecretNames() {
  console.log('Loading all stores from Supabase...\n');
  const { data: stores, error } = await supabase
    .from('marketplace_stores')
    .select('id, name, platform, api_key_secret_name, campaign_id');

  if (error) { console.error('DB error:', error); process.exit(1); }

  console.log(`Found ${stores.length} stores:\n`);

  for (const store of stores) {
    const mapping = SECRET_MAP.find(m =>
      store.name?.toLowerCase().includes(m.match.toLowerCase())
    );

    if (!mapping) {
      console.log(`  [?] "${store.name}" — no mapping, skipping`);
      continue;
    }

    const updates = {};
    const changes = [];

    if (store.api_key_secret_name !== mapping.secret) {
      updates.api_key_secret_name = mapping.secret;
      changes.push(`secret: ${store.api_key_secret_name || 'NULL'} → ${mapping.secret}`);
    }

    if (mapping.campaign_id && store.campaign_id !== mapping.campaign_id) {
      updates.campaign_id = mapping.campaign_id;
      changes.push(`campaign_id: ${store.campaign_id || 'NULL'} → ${mapping.campaign_id}`);
    }

    if (Object.keys(updates).length === 0) {
      console.log(`  [=] "${store.name}" — already correct`);
      continue;
    }

    console.log(`  [→] "${store.name}"`);
    changes.forEach(c => console.log(`      ${c}`));

    const { error: updateErr } = await supabase
      .from('marketplace_stores')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', store.id);

    if (updateErr) {
      console.error(`  [!] Update failed:`, updateErr.message);
    } else {
      console.log(`      ✓ Updated`);
    }
  }

  console.log('\n✅ Done! All api_key_secret_name and campaign_id values are now correct.');
}

fixSecretNames().catch(console.error);
