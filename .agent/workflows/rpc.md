---
description: Manage and call Supabase RPC functions (stored procedures)
---

# /rpc — Supabase RPC Functions Workflow

Create and use PostgreSQL stored procedures via Supabase RPC.

## Key RPC Functions in This Project
```sql
-- Decrement Tashkent stock (used in nakladnoy processing)
SELECT decrement_tashkent_stock(
  p_product_id := 'uuid-here',
  p_quantity := 5,
  p_variant_id := 'variant-uuid-or-null'
);

-- Increment Tashkent stock (used in undo)
SELECT increment_tashkent_stock(
  p_product_id := 'uuid',
  p_quantity := 5,
  p_variant_id := null
);
```

## Call RPC from React
```typescript
// Simple call
const { data, error } = await supabase.rpc('my_function', {
  p_param1: 'value1',
  p_param2: 123,
});

// With error handling
const { error } = await supabase.rpc('decrement_tashkent_stock', {
  p_product_id: productId,
  p_quantity: quantity,
  p_variant_id: variantId ?? null,
});
if (error) {
  console.error('RPC error:', error.message);
  throw error;
}
```

## Create a New RPC Function
```sql
-- Migration file: supabase/migrations/TIMESTAMP_add_my_rpc.sql
CREATE OR REPLACE FUNCTION public.calculate_box_total(
  p_box_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM product_items
  WHERE box_id = p_box_id;
  
  RETURN v_total;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_box_total TO authenticated;
```

## Complex RPC with JSON Return
```sql
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_warehouse_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_boxes', (SELECT COUNT(*) FROM boxes WHERE location = 'uzbekistan'),
    'total_items', (SELECT COUNT(*) FROM product_items WHERE location = 'uzbekistan'),
    'sold_today', (SELECT COALESCE(SUM(quantity), 0) FROM direct_sales 
                   WHERE DATE(created_at) = CURRENT_DATE)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;
```

## Common Patterns

### Atomic Stock Operations (Prevent Race Conditions)
```sql
-- Use FOR UPDATE to lock rows during stock changes
CREATE OR REPLACE FUNCTION public.safe_decrement_stock(...)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));
  UPDATE products SET tashkent_manual_stock = 
    GREATEST(0, tashkent_manual_stock - p_quantity)
  WHERE id = p_product_id;
END;
$$;
```

## Usage
```
/rpc "create function to calculate weekly sales by category"
/rpc "debug why decrement_tashkent_stock isn't working"
/rpc "add atomic stock reservation function"
```
