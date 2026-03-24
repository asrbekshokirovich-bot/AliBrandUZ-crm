-- ============================================================
-- Uzum/Marketplace Sale → Stock Decrement + Notification
-- When a marketplace order reaches COMPLETED or DELIVERED,
-- decrement product_variants.stock_quantity by sold qty
-- and insert a notification into notification_logs.
-- ============================================================

-- Step 1: Add stock_synced flag to marketplace_orders
--         Prevents double-decrement on re-updates
ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS stock_synced BOOLEAN DEFAULT false;

-- Step 2: Trigger function
CREATE OR REPLACE FUNCTION public.fn_sync_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item         JSONB;
  v_sku          TEXT;
  v_qty          INTEGER;
  v_variant_id   UUID;
  v_product_id   UUID;
  v_product_name TEXT;
  v_store_name   TEXT;
  v_order_number TEXT;
  v_platform     TEXT;
  v_delivered_statuses TEXT[] := ARRAY['COMPLETED', 'DELIVERED', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT'];
BEGIN
  -- Only process when status transitions to a "delivered" status
  -- and hasn't been synced yet
  IF NEW.status = ANY(v_delivered_statuses)
     AND (OLD.status IS NULL OR OLD.status <> NEW.status)
     AND (NEW.stock_synced IS NULL OR NEW.stock_synced = false)
  THEN

    -- Get store info for notification
    SELECT name, platform
      INTO v_store_name, v_platform
      FROM public.marketplace_stores
     WHERE id = NEW.store_id;

    v_order_number := COALESCE(NEW.external_order_id);

    -- Loop through order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Extract SKU: try skuId first (Uzum uses integer), then offerName (Yandex)
      v_sku := COALESCE(
        (v_item->>'skuId'),
        (v_item->>'offerName'),
        (v_item->>'sku')
      );

      v_qty := COALESCE(
        (v_item->>'quantity')::INTEGER,
        (v_item->>'count')::INTEGER,
        1
      );

      IF v_sku IS NULL OR v_qty <= 0 THEN
        CONTINUE;
      END IF;

      -- Find matching marketplace_listing by external_sku
      SELECT ml.variant_id, ml.product_id
        INTO v_variant_id, v_product_id
        FROM public.marketplace_listings ml
       WHERE ml.store_id = NEW.store_id
         AND (ml.external_sku = v_sku OR ml.external_sku = v_sku::TEXT)
       LIMIT 1;

      IF v_variant_id IS NOT NULL THEN
        -- Decrement variant stock (never below 0)
        UPDATE public.product_variants
           SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_qty),
               updated_at = now()
         WHERE id = v_variant_id;

        -- Get product name for notification
        SELECT COALESCE(p.name, 'Noma''lum mahsulot')
          INTO v_product_name
          FROM public.products p
         WHERE p.id = v_product_id;

        -- Insert sale notification for all admins/managers
        INSERT INTO public.notification_logs (user_id, title, body, event_type, entity_type, entity_id, metadata)
        SELECT
          u.id,
          '[Sale] Mahsulot sotildi — ' || COALESCE(v_store_name, v_platform),
          v_product_name || ' • ' || v_qty || ' dona • #' || v_order_number,
          'uzum_sale',
          'marketplace_order',
          NEW.id::TEXT,
          jsonb_build_object(
            'product_name', v_product_name,
            'quantity', v_qty,
            'store_name', v_store_name,
            'platform', v_platform,
            'order_number', v_order_number,
            'order_id', NEW.id,
            'variant_id', v_variant_id,
            'sku', v_sku
          )
        FROM auth.users u
        JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE ur.role IN ('bosh_admin', 'rahbar', 'manager', 'uz_manager');

      ELSIF v_product_id IS NOT NULL THEN
        -- No variant, try non-variant product stock
        UPDATE public.products
           SET quantity = GREATEST(0, COALESCE(quantity, 0) - v_qty),
               updated_at = now()
         WHERE id = v_product_id;

        SELECT COALESCE(p.name, 'Noma''lum mahsulot')
          INTO v_product_name
          FROM public.products p
         WHERE p.id = v_product_id;

        INSERT INTO public.notification_logs (user_id, title, body, event_type, entity_type, entity_id, metadata)
        SELECT
          u.id,
          '[Sale] Mahsulot sotildi — ' || COALESCE(v_store_name, v_platform),
          v_product_name || ' • ' || v_qty || ' dona • #' || v_order_number,
          'uzum_sale',
          'marketplace_order',
          NEW.id::TEXT,
          jsonb_build_object(
            'product_name', v_product_name,
            'quantity', v_qty,
            'store_name', v_store_name,
            'platform', v_platform,
            'order_number', v_order_number,
            'order_id', NEW.id,
            'sku', v_sku
          )
        FROM auth.users u
        JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE ur.role IN ('bosh_admin', 'rahbar', 'manager', 'uz_manager');
      END IF;

    END LOOP;

    -- Mark as synced so we don't process again
    NEW.stock_synced := true;

  END IF;

  RETURN NEW;
END;
$$;

-- Step 3: Attach trigger to marketplace_orders
DROP TRIGGER IF EXISTS after_marketplace_order_sale ON public.marketplace_orders;

CREATE TRIGGER after_marketplace_order_sale
  BEFORE INSERT OR UPDATE OF status
  ON public.marketplace_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_stock_on_sale();

-- Step 4: Index for faster SKU lookups in marketplace_listings
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_ext_sku
  ON public.marketplace_listings (store_id, external_sku);

-- Step 5: Enable realtime on notification_logs if not already
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND tablename = 'notification_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_logs;
  END IF;
END;
$$;
