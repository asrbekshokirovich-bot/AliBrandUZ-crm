---
description: Manage product inventory, stock levels, and warehouse operations
---

# /inventory — Inventory Management Workflow

Manage products, stock levels, and warehouse operations.

## Key Tables
```sql
products              -- Product catalog (price, cost, stock)
product_items         -- Individual tracked items (has QR/barcode)
product_variants      -- Size/color variants
variant_sku_mappings  -- Maps marketplace SKUs to variants
boxes                 -- Shipping boxes (China → Tashkent)
box_track_codes       -- Track codes inside boxes
warehouse_locations   -- Physical shelf locations
categories_hierarchy  -- Product categories
```

## Stock Check Queries
```sql
-- Current stock per product in Tashkent
SELECT 
  p.name,
  p.tashkent_manual_stock as manual_stock,
  COUNT(pi.id) as tracked_items,
  (p.tashkent_manual_stock + COUNT(pi.id)) as total
FROM products p
LEFT JOIN product_items pi ON pi.product_id = p.id 
  AND pi.location = 'uzbekistan'
  AND pi.status IN ('in_stock', 'arrived', 'in_tashkent')
WHERE p.status = 'active'
GROUP BY p.id, p.name, p.tashkent_manual_stock
ORDER BY total DESC;

-- Low stock alert (< 5 items)
SELECT name, tashkent_manual_stock 
FROM products 
WHERE status = 'active' AND tashkent_manual_stock < 5
ORDER BY tashkent_manual_stock ASC;
```

## Stock Update Patterns

### Manual Stock Update (Fast, no tracking)
```typescript
await supabase
  .from('products')
  .update({ tashkent_manual_stock: newStock })
  .eq('id', productId);
```

### Tracked Item Stock Deduction (via RPC)
```typescript
await supabase.rpc('decrement_tashkent_stock', {
  p_product_id: productId,
  p_quantity: quantity,
  p_variant_id: variantId ?? null,
});
```

### Add Tracked Items (Receive Box)
```typescript
const items = Array.from({ length: quantity }, () => ({
  product_id: productId,
  variant_id: variantId,
  box_id: boxId,
  status: 'in_tashkent',
  location: 'uzbekistan',
}));
await supabase.from('product_items').insert(items);
```

## Box Flow
```
China (packed) → in_transit → arrived → uzbekistan (in_tashkent) → sold/returned
```

## Product Item Status Flow
```
packed → in_transit → arrived_pending → in_tashkent → sold
                                      ↘ returned
```

## Inventory Reconciliation
```typescript
// Use AddProductToWarehouseDialog.tsx for manual adjustments
// Or direct SQL for bulk:
UPDATE products 
SET tashkent_manual_stock = tashkent_manual_stock + 10
WHERE id = 'product-id-here';
```

## Usage
```
/inventory "check which products are running low in Tashkent"
/inventory "add 50 units manually to product stock"
/inventory "trace where a specific box's items went"
```
