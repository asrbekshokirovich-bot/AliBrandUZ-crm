-- Migration to drop the purge trigger that was deleting marketplace_orders
DROP TRIGGER IF EXISTS on_new_marketplace_order ON public.marketplace_orders;
DROP FUNCTION IF EXISTS public.notify_new_marketplace_order();
