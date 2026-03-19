import { PlaywrightCrawler, log, ProxyConfiguration } from 'crawlee';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_WEBHOOK_URL = process.env.SUPABASE_WEBHOOK_URL;
const BRIGHT_DATA_PROXY_URL = process.env.BRIGHT_DATA_PROXY_URL;

if (!SUPABASE_WEBHOOK_URL) {
    throw new Error('SUPABASE_WEBHOOK_URL is required in .env');
}

const proxyConfiguration = BRIGHT_DATA_PROXY_URL 
    ? new ProxyConfiguration({ proxyUrls: [BRIGHT_DATA_PROXY_URL] })
    : undefined;

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    requestHandler: async ({ page, request }) => {
        log.info(`Processing ${request.url}...`);

        // Wait for page to load - BrightData's Web Unlocker handles CAPTCHAs automatically
        await page.waitForSelector('h1', { timeout: 15000 }).catch(() => log.warning('Title not found'));
        
        const title = await page.locator('h1').first().innerText().catch(() => 'Unknown product');
        const priceText = await page.locator('[data-auto="product-price"], [data-auto="price-value"]').first().innerText().catch(() => '0');
        const description = await page.locator('[data-auto="product-description"]').first().innerText().catch(() => '');
        const imageElement = await page.locator('img').first().getAttribute('src').catch(() => '');
        
        const price = parseInt(priceText.replace(/\D/g, ''), 10) || 0;
        
        // Extract external ID
        const match = request.url.match(/product.*?\/(\d+)/);
        const external_id = match ? match[1] : Date.now().toString();

        const productData = {
            marketplace: 'yandex',
            external_id,
            title,
            description,
            price,
            currency: 'RUB',
            url: request.url,
            image_url: imageElement,
            metadata: {
                scraped_at: new Date().toISOString()
            }
        };

        log.info(`Extracted: ${title} - ${price} RUB`);

        try {
            const response = await axios.post(SUPABASE_WEBHOOK_URL, productData, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            log.info(`✅ Successfully pushed to Supabase: ${response.status}`);
        } catch (error: any) {
            log.error(`❌ Failed to push to Supabase: ${error.message}`);
        }
    },
});

// Example URL: test it with a real Yandex product URL
crawler.run([
    'https://market.yandex.ru/product--smartfon-apple-iphone-15-pro/1908064973' // Replace with target URL
]);
