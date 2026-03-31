import fs from 'fs';

const envContent = fs.readFileSync('.env.vercel.production', 'utf-8');
const lines = envContent.split('\n');
let url = '';
let key = '';
for (const line of lines) {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
        key = line.split('=')[1].trim();
        // remove any quotes
        if (key.startsWith('"') || key.startsWith("'")) key = key.substring(1);
        if (key.endsWith('"') || key.endsWith("'")) key = key.substring(0, key.length - 1);
    }
}

async function findStores() {
    const resp = await fetch(`${url}/rest/v1/marketplace_stores?select=id,name,shop_id,api_key_secret_name&platform=eq.uzum`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    const data = await resp.json();
    console.table(data);
}
findStores();
