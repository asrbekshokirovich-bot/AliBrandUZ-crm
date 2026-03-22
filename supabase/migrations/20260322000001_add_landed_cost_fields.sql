-- Migration: Add True Landed Cost fields
-- Date: 2026-03-22
-- Description: Adds logistic cost breakdown fields to boxes table
--              and weight/landed cost to product_items

-- 1. boxes jadvaliga logistika xarajati maydonlari qo'shish
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS local_delivery_fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cargo_fee           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_fee       NUMERIC DEFAULT 0;

COMMENT ON COLUMN boxes.local_delivery_fee IS 'Xitoy ichki yetkazib berish narxi (CNY)';
COMMENT ON COLUMN boxes.cargo_fee          IS 'Xitoy → Toshkent yuk tashish narxi (CNY)';
COMMENT ON COLUMN boxes.packaging_fee      IS 'Qadoqlash narxi (CNY)';

-- 2. product_items jadvaliga og'irlik va yakuniy tannarx qo'shish
ALTER TABLE product_items
  ADD COLUMN IF NOT EXISTS weight_grams          NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landed_cost_per_unit  NUMERIC DEFAULT NULL;

COMMENT ON COLUMN product_items.weight_grams         IS 'Mahsulot bitta dona og''irligi (gramm)';
COMMENT ON COLUMN product_items.landed_cost_per_unit  IS 'Yakuniy tannarx = sotib olish narxi + proporsional logistika (CNY)';
