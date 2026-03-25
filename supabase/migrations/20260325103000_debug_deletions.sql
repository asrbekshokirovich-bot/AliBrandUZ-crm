-- ============================================================
-- Debugging Silent Deletions on marketplace_orders
-- ============================================================

CREATE TABLE IF NOT EXISTS public.debug_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT,
  record_id UUID,
  external_id TEXT,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  meta JSONB
);

CREATE OR REPLACE FUNCTION public.fn_log_deletions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.debug_deletions (table_name, record_id, external_id, meta)
  VALUES ('marketplace_orders', OLD.id, OLD.external_order_id, jsonb_build_object(
    'old_status', OLD.status,
    'old_fulfillment', OLD.fulfillment_status,
    'old_store', OLD.store_id
  ));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_debug_deletions ON public.marketplace_orders;
CREATE TRIGGER trigger_debug_deletions
  AFTER DELETE ON public.marketplace_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_deletions();
