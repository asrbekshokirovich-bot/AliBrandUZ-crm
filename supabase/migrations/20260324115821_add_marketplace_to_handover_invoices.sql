-- Add marketplace column to handover_invoices table
-- This allows filtering invoices by marketplace (uzum, yandex, wildberries)

ALTER TABLE public.handover_invoices 
  ADD COLUMN IF NOT EXISTS marketplace TEXT 
  CHECK (marketplace IS NULL OR marketplace IN ('uzum', 'yandex', 'wildberries'));

-- Index for fast marketplace filtering
CREATE INDEX IF NOT EXISTS idx_handover_invoices_marketplace 
  ON public.handover_invoices(marketplace);
