import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_WEBHOOK_URL = process.env.SUPABASE_WEBHOOK_URL;

async function testIngestion() {
    console.log(`Testing webhook: ${SUPABASE_WEBHOOK_URL}`);
    const productData = {
        marketplace: 'uzum',
        external_id: `test-${Date.now()}`,
        title: 'Mock Test iPhone 15 Pro',
        description: 'Testing the data pipeline',
        price: 15000000,
        currency: 'UZS',
        url: 'https://uzum.uz/test',
        image_url: 'https://example.com/image.jpg',
        metadata: {
            scraped_at: new Date().toISOString()
        }
    };

    try {
        const response = await axios.post(SUPABASE_WEBHOOK_URL!, productData, {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });
        console.log(`✅ Success: ${response.status}`, response.data);
    } catch (error: any) {
        console.error(`❌ Failed:`, error.response?.data || error.message);
    }
}

testIngestion();
