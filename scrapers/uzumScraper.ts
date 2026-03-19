import { PlaywrightCrawler, log } from 'crawlee';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_WEBHOOK_URL = process.env.SUPABASE_WEBHOOK_URL;

if (!SUPABASE_WEBHOOK_URL) {
    throw new Error('SUPABASE_WEBHOOK_URL is required in .env');
}

const crawler = new PlaywrightCrawler({
    requestHandler: async ({ page, request }) => {
        log.info(`Processing ${request.url}...`);

        // Wait for product details to load (adjust selectors as per actual Uzum DOM)
        await page.waitForSelector('h1', { timeout: 15000 }).catch(() => log.warning('Title not found quickly'));
        
        const title = await page.locator('h1').first().innerText().catch(() => 'Unknown Title');
        const priceText = await page.locator('[data-test-id="product-price"], .currency, .price').first().innerText().catch(() => '0');
        const description = await page.locator('[data-test-id="product-description"], .description').first().innerText().catch(() => '');
        const imageUrl = await page.locator('img').first().getAttribute('src').catch(() => '');
        
        const price = parseInt(priceText.replace(/\D/g, ''), 10) || 0;
        
        // Extract a clean external ID from the URL
        const urlParts = request.url.split('/');
        const external_id = urlParts[urlParts.length - 1].split('?')[0];

        const productData = {
            marketplace: 'uzum',
            external_id,
            title,
            description,
            price,
            currency: 'UZS',
            url: request.url,
            image_url: imageUrl,
            metadata: {
                scraped_at: new Date().toISOString()
            }
        };

        log.info(`Extracted: ${title} - ${price} UZS`);

        try {
            const response = await axios.post(SUPABASE_WEBHOOK_URL, productData, {
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                }
            });
            log.info(`✅ Successfully pushed to Supabase: ${response.status}`);
        } catch (error: any) {
            log.error(`❌ Failed to push to Supabase: ${error.message}`);
        }
    },
});

// Example URL: test it with a real Uzum product URL
crawler.run([
    'https://uzum.uz/uz/product/smartfon-apple-iphone-15-pro-900898' // Replace with target URL
]);
