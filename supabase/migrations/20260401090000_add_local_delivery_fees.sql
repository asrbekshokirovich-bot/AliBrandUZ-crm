-- Add new columns to boxes for local delivery and abu sahiy fees
ALTER TABLE public.boxes 
ADD COLUMN IF NOT EXISTS abu_saxiy_fee_usd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS tashkent_delivery_fee_uzs NUMERIC DEFAULT 0;

-- Update the RPC to include these fields in distribution
CREATE OR REPLACE FUNCTION public.auto_distribute_box_shipping_cost(
  p_box_id UUID, 
  p_shipping_cost NUMERIC, 
  p_volume_m3 NUMERIC, 
  p_usd_to_uzs NUMERIC, 
  p_packaging_fee NUMERIC DEFAULT 0,
  p_abu_saxiy_fee_usd NUMERIC DEFAULT 0,
  p_tashkent_delivery_fee_uzs NUMERIC DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  item_count INTEGER;
  per_item_volume NUMERIC;
  per_item_shipping NUMERIC;
  updated_count INTEGER := 0;
  total_logistics_usd NUMERIC := 0;
BEGIN
  -- Qutidagi itemlar sonini hisoblash (nuqsonli yoki yetishmaydiganlarni chiqazib tashlaymiz)
  SELECT COUNT(*) INTO item_count
  FROM public.product_items pi
  LEFT JOIN public.verification_items vi ON vi.product_item_id = pi.id
  WHERE pi.box_id = p_box_id
  AND (vi.status IS NULL OR vi.status = 'ok');

  IF item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Qutida yaroqli o''ramlar topilmadi', 'updated', 0);
  END IF;

  per_item_volume := COALESCE(p_volume_m3, 0) / item_count;
  
  -- Umimiy qiymatni hisoblaymiz: Xitoy dostavkasi(USD) + upakovka(USD) + Abu Saxiy xizmati(USD) + Toshkent ko'cha dostavkasi (UZS -> USD)
  total_logistics_usd := COALESCE(p_shipping_cost, 0) + COALESCE(p_packaging_fee, 0) + COALESCE(p_abu_saxiy_fee_usd, 0);
  
  IF p_usd_to_uzs > 0 AND COALESCE(p_tashkent_delivery_fee_uzs, 0) > 0 THEN
    total_logistics_usd := total_logistics_usd + (p_tashkent_delivery_fee_uzs / p_usd_to_uzs);
  END IF;

  per_item_shipping := total_logistics_usd / item_count;

  -- 1) Barcha itemlarni qadoqlash, karobkani yetkazish kabi logistika xarajatlari "international_shipping_cost" sifatida har biriga teng taqsimlanadi
  UPDATE public.product_items pi
  SET 
    volume_m3 = per_item_volume,
    international_shipping_cost = per_item_shipping,
    final_cost_usd = COALESCE(unit_cost_usd, 0) + COALESCE(domestic_shipping_cost, 0) + per_item_shipping
  FROM (
    SELECT pi2.id
    FROM public.product_items pi2
    LEFT JOIN public.verification_items vi2 ON vi2.product_item_id = pi2.id
    WHERE pi2.box_id = p_box_id
    AND (vi2.status IS NULL OR vi2.status = 'ok')
  ) as valid_items
  WHERE pi.id = valid_items.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Shipping cost distributed successfully', 
    'updated', updated_count,
    'total_logistics_usd', total_logistics_usd
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM, 'updated', 0);
END;
$function$;
