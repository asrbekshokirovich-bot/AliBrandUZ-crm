import fs from 'fs';

const envContent = fs.readFileSync('.env.vercel.production', 'utf-8');
const lines = envContent.split('\n');
let url = '';
let key = '';
for (const line of lines) {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
        url = line.split('=')[1].trim();
        if (url.startsWith('"') || url.startsWith("'")) url = url.substring(1);
        if (url.endsWith('"') || url.endsWith("'")) url = url.substring(0, url.length - 1);
    }
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
        key = line.split('=')[1].trim();
        if (key.startsWith('"') || key.startsWith("'")) key = key.substring(1);
        if (key.endsWith('"') || key.endsWith("'")) key = key.substring(0, key.length - 1);
    }
}

async function fixShopId() {
    console.log(`Fixing shop_id for 'Atlas Market'...`);
    // First, find the exact row
    const resp = await fetch(`${url}/rest/v1/marketplace_stores?select=id,name,shop_id&name=eq.Atlas Market`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    const data = await resp.json();
    console.log("Current state:", data);

    if (data && data.length > 0) {
        const storeId = data[0].id;
        const correctId = '69508'; // Matches Seller ID
        
        // Update it
        console.log(`Sending PATCH to update shop_id to ${correctId}`);
        const patchResp = await fetch(`${url}/rest/v1/marketplace_stores?id=eq.${storeId}`, {
            method: 'PATCH',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ shop_id: correctId })
        });
        
        const updateResult = await patchResp.json();
        console.log("Update Success:", updateResult);
    }
}
fixShopId();
