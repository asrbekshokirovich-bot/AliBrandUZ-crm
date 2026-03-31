-- Add dbs_campaign_id for Yandex DBS (Delivery by Seller) support
ALTER TABLE public.marketplace_stores
ADD COLUMN IF NOT EXISTS dbs_campaign_id TEXT;

-- Update the existing comments just in case
COMMENT ON COLUMN public.marketplace_stores.dbs_campaign_id IS 'Store specific Campaign ID intended for Delivery by Seller (DBS) operations on Yandex';
