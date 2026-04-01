const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL="?(https:\/\/[^\s"]+)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY="?([a-zA-Z0-9.\-_]+)/);

if (!urlMatch || !keyMatch) {
  console.log("Could not parse ENV");
  process.exit(1);
}

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  console.log("Fetching box...");
  // Find the box FS0013592-1 to get its box_id
  const { data: box } = await supabase.from('boxes').select('id, box_number').eq('box_number', 'FS0013592-1').single();
  
  if (!box) {
    console.log("Box not found!");
    return;
  }
  
  console.log("Found box:", box.id);
  
  // Fetch box items
  const { data: rawBoxItems, error } = await supabase
        .from('product_items')
        .select(`
          id,
          product_id,
          variant_id,
          weight_grams,
          product_variants(id, weight)
        `)
        .in('box_id', [box.id]);
        
  if (error) {
    console.error("Error fetching items:", error);
    return;
  }
  
  console.log(`Fetched ${rawBoxItems?.length} items`);
  
  // Transform to the shape
  const boxItems = rawBoxItems.map(item => ({
        id: item.id,
        variant_id: item.variant_id,
        weight_grams: item.weight_grams,
        saved_variant_weight: item.product_variants && !Array.isArray(item.product_variants) ? item.product_variants.weight : null,
  }));
  
  const itemWeights = {}; // User didn't type anything specific in the screenshot
  const totalShippingCost = "200";
  const shippingCost = parseFloat(totalShippingCost);
  
  console.log("Starting distribution computation...");
  
  let totalW = 0;
  const updatesToVariant = {};
  
  const computedItems = boxItems.map(item => {
    let finalWeight = item.weight_grams || 0;
    
    // 1. If edited in UI
    if (itemWeights[item.id] !== undefined && itemWeights[item.id] !== '') {
      finalWeight = parseFloat(itemWeights[item.id]) || 0;
      if (item.variant_id && finalWeight > 0) {
        updatesToVariant[item.variant_id] = finalWeight;
      }
    } 
    // 2. If no weight but variant has it
    else if (!item.weight_grams && item.saved_variant_weight) {
      finalWeight = item.saved_variant_weight;
    }

    totalW += finalWeight;
    return { item, finalWeight };
  }) || [];

  const itemUpdates = computedItems.map(({ item, finalWeight }) => {
    const share = totalW > 0 
      ? (finalWeight / totalW) * shippingCost 
      : shippingCost / computedItems.length;
    
    return {
      id: item.id,
      weight_grams: finalWeight > 0 ? finalWeight : item.weight_grams,
      international_shipping_cost: share
    };
  });
  
  console.log("Total computed weight:", totalW);
  console.log("Sample update:", itemUpdates[0]);
  
  console.log("Executing item updates in chunks...");
  
  // 2. Execute item updates in concurrent chunks of 50 to avoid rate limits
  const chunkSize = 50;
  for (let i = 0; i < itemUpdates.length; i += chunkSize) {
    console.log(`Processing chunk ${i/chunkSize + 1}...`);
    const chunk = itemUpdates.slice(i, i + chunkSize);
    
    try {
      const res = await Promise.all(
        chunk.map(update => 
          supabase.from('product_items')
            .update({
              weight_grams: update.weight_grams,
              international_shipping_cost: update.international_shipping_cost
            })
            .eq('id', update.id)
        )
      );
      
      const errors = res.filter(r => r.error);
      if (errors.length > 0) {
         console.error("DB Errors in chunk:", errors.map(e => e.error));
      }
      
    } catch (e) {
      console.error("Promise thrown error:", e);
    }
  }
  
  console.log("Finished successfully");
}

run();
