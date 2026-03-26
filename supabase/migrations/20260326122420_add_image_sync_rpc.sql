-- Create a function to auto-sync missing images from marketplace listings
CREATE OR REPLACE FUNCTION sync_missing_product_images()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_variants integer := 0;
  updated_products integer := 0;
BEGIN
  -- Update variant images where they are null but exist in marketplace
  WITH matching_images AS (
    SELECT DISTINCT ON (v.id) v.id as variant_id, ml.image_url
    FROM product_variants v
    JOIN marketplace_listings ml ON ml.product_id = v.product_id
    WHERE v.image_url IS NULL
      AND ml.image_url IS NOT NULL
      AND (
        (ml.external_barcode IS NOT NULL AND ml.external_barcode = v.barcode) OR
        (ml.external_sku IS NOT NULL AND ml.external_sku = v.sku) OR
        (ml.external_sku IS NULL AND ml.external_barcode IS NULL) -- fallback if variant has no specific match but shares product
      )
  )
  UPDATE product_variants pv
  SET image_url = mi.image_url
  FROM matching_images mi
  WHERE pv.id = mi.variant_id;
  
  GET DIAGNOSTICS updated_variants = ROW_COUNT;

  -- Update main product images where they are null but exist in marketplace
  WITH matching_images AS (
    SELECT DISTINCT ON (p.id) p.id as product_id, ml.image_url
    FROM products p
    JOIN marketplace_listings ml ON ml.product_id = p.id
    WHERE p.main_image_url IS NULL
      AND ml.image_url IS NOT NULL
  )
  UPDATE products p
  SET main_image_url = mi.image_url
  FROM matching_images mi
  WHERE p.id = mi.product_id;

  GET DIAGNOSTICS updated_products = ROW_COUNT;

  RETURN updated_variants + updated_products;
END;
$$;
