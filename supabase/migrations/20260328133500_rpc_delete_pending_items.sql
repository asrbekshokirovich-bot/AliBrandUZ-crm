-- Migration: Add RPC to safely delete pending product items
-- Creates a function to bypass foreign key constraints

CREATE OR REPLACE FUNCTION delete_pending_product_items(p_item_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Delete associated verification items to avoid FK constraints
  -- product_items can't be deleted if a verification session checked them
  DELETE FROM public.verification_items
  WHERE product_item_id = ANY(p_item_ids);

  -- 2. Delete associated inventory_movements
  DELETE FROM public.inventory_movements
  WHERE product_item_id = ANY(p_item_ids);
  
  -- 3. Delete the product_items
  DELETE FROM public.product_items
  WHERE id = ANY(p_item_ids);
END;
$$;
