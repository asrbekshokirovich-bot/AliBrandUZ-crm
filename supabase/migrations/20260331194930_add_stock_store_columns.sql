ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS stock_fbs INTEGER;
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS stock_fbu INTEGER;
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS stock_fby INTEGER;
