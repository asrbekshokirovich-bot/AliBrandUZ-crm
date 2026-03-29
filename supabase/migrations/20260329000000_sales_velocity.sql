-- Migration to track product sales specifically and use it to auto-calculate avg_daily_sales

-- 1. Create a table to track exact sales events
CREATE TABLE IF NOT EXISTS public.product_sales_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    source TEXT NOT NULL,
    sold_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast 30-day velocity queries
CREATE INDEX IF NOT EXISTS idx_product_sales_log_product_time 
    ON public.product_sales_log(product_id, sold_at);

-- 2. Function to recalculate avg_daily_sales and update products table
CREATE OR REPLACE FUNCTION public.recalculate_avg_daily_sales(p_product_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_sold INTEGER;
    v_avg NUMERIC;
BEGIN
    -- Calculate total sales strictly within the last 30 days
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_total_sold
    FROM public.product_sales_log
    WHERE product_id = p_product_id
      AND sold_at >= NOW() - INTERVAL '30 days';

    -- Average daily sales = total / 30.0 (Round up for safety or use exact decimal)
    v_avg := v_total_sold / 30.0;
    
    -- Never let it be precisely 0 if we sold at least 1, but mathematical average is fine.
    -- Update the product table
    UPDATE public.products
    SET avg_daily_sales = v_avg
    WHERE id = p_product_id;
END;
$$;

-- 3. Update decrement_tashkent_stock to accurately support physical item tracking and metric logging
DROP FUNCTION IF EXISTS public.decrement_tashkent_stock(uuid, integer, uuid);

CREATE OR REPLACE FUNCTION public.decrement_tashkent_stock(
    p_product_id UUID,
    p_quantity INTEGER,
    p_variant_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_remaining INTEGER := p_quantity;
    v_item RECORD;
BEGIN
    -- STEP 1: Process manual un-tracked stock deduction
    IF p_variant_id IS NOT NULL THEN
        UPDATE product_variants
        SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - p_quantity)
        WHERE id = p_variant_id;
    END IF;

    -- Update parent product manual stock blindly
    UPDATE products
    SET tashkent_manual_stock = GREATEST(0, COALESCE(tashkent_manual_stock, 0) - p_quantity)
    WHERE id = p_product_id;
    
    -- STEP 2: Process Tracked product_items (Status: in_tashkent -> sold)
    -- We loop through oldest available items and switch them
    IF p_variant_id IS NOT NULL THEN
        FOR v_item IN (
            SELECT id FROM product_items 
            WHERE product_id = p_product_id 
              AND variant_id = p_variant_id 
              AND status = 'in_tashkent'
            ORDER BY created_at ASC
        )
        LOOP
            EXIT WHEN v_remaining <= 0;
            UPDATE product_items SET status = 'sold', updated_at = NOW() WHERE id = v_item.id;
            v_remaining := v_remaining - 1;
        END LOOP;
    ELSE
        FOR v_item IN (
            SELECT id FROM product_items 
            WHERE product_id = p_product_id 
              AND status = 'in_tashkent'
            ORDER BY created_at ASC
        )
        LOOP
            EXIT WHEN v_remaining <= 0;
            UPDATE product_items SET status = 'sold', updated_at = NOW() WHERE id = v_item.id;
            v_remaining := v_remaining - 1;
        END LOOP;
    END IF;

    -- STEP 3: Insert sales log for proper telemetry
    INSERT INTO public.product_sales_log (product_id, variant_id, quantity, source)
    VALUES (p_product_id, p_variant_id, p_quantity, 'handover_nakladnoy');

    -- STEP 4: Immediately trigger velocity recalculation
    PERFORM recalculate_avg_daily_sales(p_product_id);
END;
$$;
