import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('products').select('*').ilike('name', '%atr idish%');
  console.log('Products found:', data?.map(d => ({ id: d.id, name: d.name, category: d.category_id })));
  
  if (data?.length > 0) {
     const ids = data.map(d => d.id);
     const { data: items } = await supabase.from('product_items').select('id, product_id, location, status, box_id').in('product_id', ids);
     console.log('Items by product:');
     ids.forEach(id => {
       const productItems = items.filter(i => i.product_id === id);
       const uzbItems = productItems.filter(i => i.location === 'uzbekistan');
       console.log(`Product ${id}: ${productItems.length} total items, ${uzbItems.length} in UZB`);
     });
  }
}
run();
