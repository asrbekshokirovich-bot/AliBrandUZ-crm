import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZUM_API_BASE = 'https://api-seller.uzum.uz/api/seller-openapi';
const DELTA_MINUTES = 30; // 30 daqiqalik datchik
const MAX_EXECUTION_MS = 38000; // 38s Vercel limit

// Convert Uzum status to DB fulfillment_status
function mapToFulfillmentStatus(uzumStatus: string): string {
  const statusMap: Record<string, string> = {
    'CREATED': 'pending',
    'PACKING': 'pending', 
    'PENDING_DELIVERY': 'shipped',
    'DELIVERING': 'shipped',
    'DELIVERED': 'delivered',
    'ACCEPTED_AT_DP': 'shipped',
    'DELIVERED_TO_CUSTOMER_DELIVERY_POINT': 'shipped',
    'COMPLETED': 'delivered',
    'CANCELED': 'cancelled',
    'PENDING_CANCELLATION': 'cancelled',
    'RETURNED': 'returned',
  };
  return statusMap[uzumStatus] || 'pending';
}

function normalizeEpoch(timestamp: number | undefined): number | undefined {
  if (!timestamp) return undefined;
  if (timestamp >= 1e12) return Math.floor(timestamp / 1000);
  return timestamp;
}

function unixToIso(timestamp: number | undefined): string | null {
  if (!timestamp) return null;
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return null;
  }
}

// Transform Uzum Order to DB model
function transformOrderToRecord(order: any, store_id: string): Record<string, unknown> {
  const marketplaceCommission = order.orderItems?.reduce((sum: number, item: any) => sum + (item.commission || 0), 0) || 0;
  const deliveryFee = order.orderItems?.reduce((sum: number, item: any) => sum + (item.logisticDeliveryFee || 0), 0) || 0;

  return {
    store_id,
    external_order_id: String(order.id),
    status: order.status,
    fulfillment_type: order.scheme ? order.scheme.toLowerCase() : 'fbs',
    fulfillment_status: mapToFulfillmentStatus(order.status),
    customer_name: order.deliveryInfo?.customerFullname || null,
    customer_phone: order.deliveryInfo?.customerPhone || null,
    shipping_address: {
      address: order.dropOffPoint?.address || order.deliveryInfo?.deliveryAddress,
      region: order.place
    },
    total_amount: order.price,
    currency: 'UZS',
    commission: marketplaceCommission,
    delivery_cost: deliveryFee,
    items: order.orderItems?.map((rawItem: any) => {
      const actualTitle = rawItem.title !== rawItem.skuTitle ? rawItem.title : null;
      let imageUrl: string | null = null;
      if (rawItem.photo?.photoKey) {
        imageUrl = `https://images.uzum.uz/${rawItem.photo.photoKey}/t_product_240_high.jpg`;
      } else if (rawItem.productImage?.photoKey) {
        imageUrl = `https://images.uzum.uz/${rawItem.productImage.photoKey}/t_product_240_high.jpg`;
      }
      return {
        id: rawItem.id,
        status: rawItem.status ?? null,
        productId: rawItem.productId ?? null,
        skuId: rawItem.skuId ?? rawItem.id,
        barcode: rawItem.barcode ? String(rawItem.barcode) : null,
        title: actualTitle,
        skuTitle: rawItem.skuTitle ?? null,
        skuFullTitle: actualTitle ? `${actualTitle} - ${rawItem.skuTitle || ''}`.trim() : rawItem.skuTitle ?? null,
        variant: rawItem.skuCharValue ?? rawItem.identifierInfo ?? null,
        price: rawItem.sellerPrice ?? rawItem.price ?? null,
        quantity: rawItem.amount,
        returned: rawItem.amountReturns ?? null,
        cancelled: rawItem.cancelled ?? null,
        commission: rawItem.commission ?? null,
        profit: rawItem.sellerProfit ?? null,
        purchasePrice: rawItem.purchasePrice ?? null,
        deliveryFee: rawItem.logisticDeliveryFee ?? null,
        image: imageUrl,
      };
    }) || [],
    ordered_at: unixToIso(order.dateCreated),
    shipped_at: unixToIso(order.acceptedDate),
    delivered_at: ['DELIVERED', 'COMPLETED'].includes(order.status) 
      ? (unixToIso(order.completedDate) || unixToIso(order.acceptedDate) || new Date().toISOString())
      : null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Ochiq barcha Uzum do'konlarini fetch qilish
    const { data: stores, error: storesError } = await supabase
      .from('marketplace_stores')
      .select('id, name, api_key_secret_name')
      .eq('platform', 'uzum')
      .eq('is_active', true);

    if (storesError || !stores?.length) {
      return new Response(JSON.stringify({ success: true, message: "Aktiv Uzum do'konlar mavjud emas." }), { headers: corsHeaders });
    }

    console.log(`[uzum-fast-catch] Started for ${stores.length} stores. Delta: ${DELTA_MINUTES} mins.`);

    let fetchPromises = stores.map(async (store) => {
      let inserted = 0, updated = 0;
      try {
        if (!store.api_key_secret_name) return { store: store.name, success: false, reason: 'No token name' };

        const secret = Deno.env.get(store.api_key_secret_name);
        if (!secret) return { store: store.name, success: false, reason: `API key not found in env for ${store.api_key_secret_name}` };

        const nowUnixSeconds = Math.floor(Date.now() / 1000);
        const deltaSeconds = nowUnixSeconds - (DELTA_MINUTES * 60);

        const params = new URLSearchParams({
          dateFrom: String(deltaSeconds),
          dateTo: String(nowUnixSeconds),
          size: '100', // 100 ta katta margin
        });

        const res = await fetch(`${UZUM_API_BASE}/v1/orders?${params}`, {
          headers: { 'Authorization': secret, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000), // Maximum API wait 15s per store
        });

        if (!res.ok) {
           return { store: store.name, success: false, reason: `API error ${res.status}` };
        }

        const data = await res.json();
        const orders = data.payload?.items || [];
        
        if (orders.length === 0) {
           return { store: store.name, success: true, records: 0 };
        }

        // Barcha orderlarni DB ga sync qilish
        for (const order of orders) {
           const record = transformOrderToRecord(order, store.id);
           
           // UPSERT logic: check first using ID. DB id is string (external_order_id)
           const { error: upsertErr } = await supabase
             .from('marketplace_orders')
             .upsert({ ...record, updated_at: new Date().toISOString() }, {
                onConflict: 'store_id,external_order_id',
                ignoreDuplicates: false
             });
             
           if (!upsertErr) updated++;
        }
        
        return { store: store.name, success: true, records: orders.length, updated };

      } catch (e: any) {
        return { store: store.name, success: false, reason: e.message };
      }
    });

    const results = await Promise.all(fetchPromises);
    const duration = Date.now() - startTime;

    console.log(`[uzum-fast-catch] Done in ${duration}ms.`, results);

    return new Response(JSON.stringify({
      success: true,
      duration_ms: duration,
      results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
     return new Response(JSON.stringify({ success: false, error: error.message }), 
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
