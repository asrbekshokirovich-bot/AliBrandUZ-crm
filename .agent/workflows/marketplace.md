---
description: Handle marketplace integrations - Uzum Market, Yandex Market, Wildberries
---

# /marketplace — Marketplace Integration Workflow

Manage Uzum Market, Yandex Market, and Wildberries integrations.

## Marketplace Architecture
```
src/pages/crm/StoreAnalytics.tsx       ← Marketplace analytics dashboard
src/pages/crm/MarketplaceAnalytics.tsx  ← Detailed marketplace stats
src/hooks/useStoreCategoriesWithCounts.ts ← Category + count hook
supabase/functions/                     ← Sync Edge Functions
```

## Supported Marketplaces

| Marketplace | Color | Brand |
|---|---|---|
| Uzum Market | `#7B2FBE` Purple | 🛍️ |
| Yandex Market | `#FC3F1D` Red | 🟡 |
| Wildberries | `#A000DC` Deep Purple | 🫐 |

## Supabase Tables for Marketplaces
```sql
-- Orders from all marketplaces
SELECT * FROM marketplace_orders WHERE platform = 'uzum' LIMIT 10;

-- Products linked to marketplace listings  
SELECT * FROM marketplace_listings WHERE marketplace = 'wildberries';

-- Variant SKU mappings (for stock deduction)
SELECT * FROM variant_sku_mappings WHERE external_sku LIKE 'ASL%';
```

## Add New Marketplace Order
```typescript
const { error } = await supabase.from('marketplace_orders').insert({
  platform: 'uzum',         // 'uzum' | 'yandex' | 'wildberries'
  external_order_id: '12345',
  status: 'pending',
  items: JSON.stringify([{ skuTitle: 'ASL001', quantity: 2 }]),
  total_amount: 150000,
  currency: 'UZS',
});
```

## Sync Stock from Marketplace Invoice (Nakladnoy)
```typescript
// When a nakladnoy/handover invoice is processed:
// 1. Parse PDF → extract order numbers or SKUs
// 2. Match to marketplace_orders via external_order_id
// 3. Match SKUs to variant_sku_mappings
// 4. Decrement stock via RPC
await supabase.rpc('decrement_tashkent_stock', {
  p_product_id: productId,
  p_quantity: quantity,
  p_variant_id: variantId,
});
```

## Common Marketplace Issues

| Issue | Fix |
|---|---|
| Order not found by SKU | Check `variant_sku_mappings` table |
| Wrong stock deduction | Verify `decrement_tashkent_stock` RPC |
| Nakladnoy PDF not parsing | Check `pdfInvoiceParser.ts` patterns |
| Marketplace field missing | Run `alter table add column marketplace` |

## Usage
```
/marketplace "sync Uzum orders with inventory"
/marketplace "add Wildberries nakladnoy parsing"
/marketplace "fix stock not deducting for Yandex orders"
```
