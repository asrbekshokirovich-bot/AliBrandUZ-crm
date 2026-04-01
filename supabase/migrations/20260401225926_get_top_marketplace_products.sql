-- Migration: get_top_marketplace_products
-- Description: RPC function to aggregate real sales volume from marketplace_orders items array

CREATE OR REPLACE FUNCTION public.get_top_marketplace_products(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_platform TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT NULL
)
RETURNS TABLE (
  title TEXT,
  external_sku TEXT,
  total_quantity BIGINT,
  total_revenue NUMERIC,
  store_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH order_items AS (
    SELECT 
      mo.store_id,
      ms.name as store_name,
      jsonb_array_elements(
        CASE jsonb_typeof(mo.items)
          WHEN 'array' THEN mo.items
          ELSE '[]'::jsonb
        END
      ) AS item
    FROM public.marketplace_orders mo
    JOIN public.marketplace_stores ms ON ms.id = mo.store_id
    WHERE mo.ordered_at >= p_start_date
      AND mo.ordered_at <= p_end_date
      AND upper(mo.status) IN ('DELIVERED', 'COMPLETED', 'HANDED_OVER', 'DONE', 'ARRIVED', 'RECEIVED')
      AND (p_platform IS NULL OR p_platform = 'all' OR ms.platform = p_platform)
      AND (p_store_id IS NULL OR mo.store_id = p_store_id)
  )
  SELECT 
    COALESCE((item->>'title')::TEXT, (item->>'name')::TEXT, 'Noma''lum mahsulot') as title,
    COALESCE((item->>'external_sku')::TEXT, (item->>'sku')::TEXT, (item->>'offerId')::TEXT, '') as external_sku,
    SUM(COALESCE((item->>'quantity')::NUMERIC, 1))::BIGINT as total_quantity,
    SUM(COALESCE((item->>'price')::NUMERIC, 0) * COALESCE((item->>'quantity')::NUMERIC, 1)) as total_revenue,
    array_agg(DISTINCT oi.store_name) as store_names
  FROM order_items oi
  GROUP BY 
    COALESCE((item->>'title')::TEXT, (item->>'name')::TEXT, 'Noma''lum mahsulot'), 
    COALESCE((item->>'external_sku')::TEXT, (item->>'sku')::TEXT, (item->>'offerId')::TEXT, '')
  ORDER BY total_quantity DESC
  LIMIT 20;
END;
$$;
