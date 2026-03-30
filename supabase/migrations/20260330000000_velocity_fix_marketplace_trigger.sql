-- ============================================================
-- Sales Velocity Fix: fn_sync_stock_on_sale + product_sales_log
-- When a marketplace order reaches COMPLETED or DELIVERED,
-- write to product_sales_log and recalculate avg_daily_sales
-- so that "Taxminiy buyurtma berish sanasi" and "reorderQty"
-- columns in TashkentWarehouseIndicators become live.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_sync_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_delivered_statuses TEXT[] := ARRAY[
    'COMPLETED',
    'DELIVERED',
    'DELIVERED_TO_CUSTOMER_DELIVERY_POINT'
  ];
BEGIN
  -- Only process when status transitions to a "delivered" status
  -- and hasn't been synced yet (prevents double-decrement)
  IF NEW.status = ANY(v_delivered_statuses)
     AND (OLD.status IS NULL OR OLD.status <> NEW.status)
     AND (NEW.stock_synced IS NULL OR NEW.stock_synced = false)
  THEN

    -- Get store info for notification
    SELECT name, platform
      INTO v_store_name, v_platform
      FROM public.marketplace_stores
     WHERE id = NEW.store_id;

    v_order_number := COALESCE(NEW.external_order_id, '');

    -- Loop through each item in the order's JSON array
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

        -- Also decrement product-level manual stock
        UPDATE public.products
           SET tashkent_manual_stock = GREATEST(0, COALESCE(tashkent_manual_stock, 0) - v_qty),
               updated_at = now()
         WHERE id = v_product_id;

        -- Get product name for notification
        SELECT COALESCE(p.name, 'Noma''lum mahsulot')
          INTO v_product_name
          FROM public.products p
         WHERE p.id = v_product_id;

        -- === VELOCITY: Write to sales log ===
        INSERT INTO public.product_sales_log (product_id, variant_id, quantity, source)
        VALUES (v_product_id, v_variant_id, v_qty,
                'marketplace_' || COALESCE(v_platform, 'online'));

        -- === VELOCITY: Recalculate avg_daily_sales immediately ===
        PERFORM public.recalculate_avg_daily_sales(v_product_id);

        -- Insert sale notification for admins/managers
        INSERT INTO public.notification_logs (user_id, title, body, event_type, entity_type, entity_id, metadata)
        SELECT
          u.id,
          '[Sale] Mahsulot sotildi – ' || COALESCE(v_store_name, v_platform),
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
        -- No variant: decrement the product-level stock
        UPDATE public.products
           SET quantity = GREATEST(0, COALESCE(quantity, 0) - v_qty),
               tashkent_manual_stock = GREATEST(0, COALESCE(tashkent_manual_stock, 0) - v_qty),
               updated_at = now()
         WHERE id = v_product_id;

        SELECT COALESCE(p.name, 'Noma''lum mahsulot')
          INTO v_product_name
          FROM public.products p
         WHERE p.id = v_product_id;

        -- === VELOCITY: Write to sales log ===
        INSERT INTO public.product_sales_log (product_id, variant_id, quantity, source)
        VALUES (v_product_id, NULL, v_qty,
                'marketplace_' || COALESCE(v_platform, 'online'));

        -- === VELOCITY: Recalculate avg_daily_sales immediately ===
        PERFORM public.recalculate_avg_daily_sales(v_product_id);

        INSERT INTO public.notification_logs (user_id, title, body, event_type, entity_type, entity_id, metadata)
        SELECT
          u.id,
          '[Sale] Mahsulot sotildi – ' || COALESCE(v_store_name, v_platform),
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

    END LOOP; -- end item loop

    -- Mark this order as synced to prevent double processing
    NEW.stock_synced := true;

  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (BEFORE so we can mutate NEW.stock_synced)
DROP TRIGGER IF EXISTS after_marketplace_order_sale ON public.marketplace_orders;

CREATE TRIGGER after_marketplace_order_sale
  BEFORE INSERT OR UPDATE OF status
  ON public.marketplace_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_stock_on_sale();
