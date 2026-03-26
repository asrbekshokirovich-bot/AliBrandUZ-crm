import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ybtfepdqzbgmtlsiisvp.supabase.co"; // the one from .env and client.ts
const SUPABASE_KEY = "sb_publishable_wk3pW4CAxzc90nks94MRHw_meKO-VWe";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStock400() {
  console.log('--- SEARCHING BY EXACT STOCK (400) ---');
  
  const { data: products } = await supabase
    .from('products')
    .select('id, name, tashkent_manual_stock, main_image_url')
    .eq('tashkent_manual_stock', 400);

  console.log('Products with exactly 400 stock:', products);

  const { data: variants } = await supabase
    .from('product_variants')
    .select('id, product_id, sku, stock_quantity, variant_attributes')
    .eq('stock_quantity', 400);

  console.log('Variants with exactly 400 stock:', variants);
}

checkStock400().catch(console.error);

