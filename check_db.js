import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://ybtfepdqzbgmtlsiisvp.supabase.co";
const supabaseKey = "sb_publishable_wk3pW4CAxzc90nks94MRHw_meKO-VWe";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, name, cost_price, warehouse_price,
      product_variants(id, sku, price, stock_quantity, cost_price, cost_price_currency)
    `)
    .ilike('name', '%atr%')
    .limit(5);
    
  if (error) {
    console.error("DB ERROR", error);
  } else {
    console.log(JSON.stringify(products, null, 2));
  }
}

check();
