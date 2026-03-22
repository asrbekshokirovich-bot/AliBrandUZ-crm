/**
 * TRUE LANDED COST (Yakuniy Tannarx) Calculator
 *
 * Formula (proporsional og'irlik usuli):
 *   Total Logistics Fee = local_delivery_fee + cargo_fee + packaging_fee
 *   Fee per Gram        = Total Logistics Fee / total_box_weight_grams
 *   Landed Cost/item    = item_price + (item_weight_grams × Fee per Gram)
 *
 * Barcha narxlar CNY da.
 */

export interface ShipmentCosts {
  /** Xitoy ichki yetkazish narxi (CNY) */
  local_delivery_fee: number;
  /** Xitoy → Toshkent yuk tashish narxi (CNY) */
  cargo_fee: number;
  /** Qadoqlash narxi (CNY) */
  packaging_fee: number;
  /** Qutidagi barcha mahsulotlarning umumiy og'irligi (gramm) */
  total_box_weight_grams: number;
}

export interface ProductItem {
  /** Mahsulotning original sotib olish narxi (CNY) */
  item_price_cny: number;
  /** Bitta dona og'irligi (gramm) */
  item_weight_grams: number;
  /** Soni (dona) */
  quantity?: number;
}

export interface LandedCostResult {
  /** Umumiy logistika xarajati (CNY) */
  total_logistics_fee_cny: number;
  /** 1 gramm uchun logistika xarajati (CNY) */
  fee_per_gram_cny: number;
  /** 1 dona uchun yakuniy tannarx (CNY) */
  landed_cost_per_unit_cny: number;
  /** Logistika ulushi bitta dona uchun (CNY) */
  logistics_share_per_unit_cny: number;
  /** Logistika foizi mahsulot narxiga nisbatan */
  logistics_ratio_percent: number;
  /** Xato xabari (agar noto'g'ri kiritilgan bo'lsa) */
  error?: string;
}

/**
 * Bitta mahsulot uchun yakuniy tannarxni hisoblaydi
 *
 * @example
 * ```typescript
 * const result = calculateLandedCost(
 *   { item_price_cny: 50, item_weight_grams: 300 },
 *   {
 *     local_delivery_fee: 20,
 *     cargo_fee: 150,
 *     packaging_fee: 30,
 *     total_box_weight_grams: 5000
 *   }
 * );
 * // result.landed_cost_per_unit_cny = 50 + (300 × 0.04) = 62 CNY
 * ```
 */
export function calculateLandedCost(
  item: ProductItem,
  shipment: ShipmentCosts
): LandedCostResult {
  // Validatsiya
  if (shipment.total_box_weight_grams <= 0) {
    return {
      total_logistics_fee_cny: 0,
      fee_per_gram_cny: 0,
      landed_cost_per_unit_cny: item.item_price_cny,
      logistics_share_per_unit_cny: 0,
      logistics_ratio_percent: 0,
      error: 'Quti og\'irligi 0 dan katta bo\'lishi kerak',
    };
  }

  if (item.item_weight_grams < 0) {
    return {
      total_logistics_fee_cny: 0,
      fee_per_gram_cny: 0,
      landed_cost_per_unit_cny: item.item_price_cny,
      logistics_share_per_unit_cny: 0,
      logistics_ratio_percent: 0,
      error: 'Mahsulot og\'irligi manfiy bo\'lishi mumkin emas',
    };
  }

  // 1. Umumiy logistika xarajati
  const total_logistics_fee_cny =
    (shipment.local_delivery_fee || 0) +
    (shipment.cargo_fee || 0) +
    (shipment.packaging_fee || 0);

  // 2. Har bir gramm uchun xarajat
  const fee_per_gram_cny = total_logistics_fee_cny / shipment.total_box_weight_grams;

  // 3. Bitta dona uchun logistika ulushi
  const logistics_share_per_unit_cny = item.item_weight_grams * fee_per_gram_cny;

  // 4. Yakuniy tannarx
  const landed_cost_per_unit_cny = item.item_price_cny + logistics_share_per_unit_cny;

  // 5. Logistika foizi
  const logistics_ratio_percent =
    item.item_price_cny > 0
      ? (logistics_share_per_unit_cny / item.item_price_cny) * 100
      : 0;

  return {
    total_logistics_fee_cny: round2(total_logistics_fee_cny),
    fee_per_gram_cny: round4(fee_per_gram_cny),
    landed_cost_per_unit_cny: round2(landed_cost_per_unit_cny),
    logistics_share_per_unit_cny: round2(logistics_share_per_unit_cny),
    logistics_ratio_percent: round2(logistics_ratio_percent),
  };
}

/**
 * Bir qutidagi barcha mahsulotlar uchun yakuniy tannarxlarni hisoblaydi
 */
export function calculateLandedCostForBox(
  items: ProductItem[],
  shipment: ShipmentCosts
): Array<ProductItem & LandedCostResult> {
  return items.map(item => ({
    ...item,
    ...calculateLandedCost(item, shipment),
  }));
}

/**
 * Foyda marjasini hisoblaydi
 * @param selling_price_uzs UZS da sotish narxi
 * @param landed_cost_cny CNY da yakuniy tannarx
 * @param cny_to_uzs CNY → UZS kurs (masalan: 1750)
 */
export function calculateProfitMargin(
  selling_price_uzs: number,
  landed_cost_cny: number,
  cny_to_uzs: number
): {
  landed_cost_uzs: number;
  gross_profit_uzs: number;
  gross_margin_percent: number;
} {
  const landed_cost_uzs = landed_cost_cny * cny_to_uzs;
  const gross_profit_uzs = selling_price_uzs - landed_cost_uzs;
  const gross_margin_percent =
    selling_price_uzs > 0 ? (gross_profit_uzs / selling_price_uzs) * 100 : 0;

  return {
    landed_cost_uzs: round2(landed_cost_uzs),
    gross_profit_uzs: round2(gross_profit_uzs),
    gross_margin_percent: round2(gross_margin_percent),
  };
}

/** Qutidagi umumiy logistika xarajatini hisoblaydi */
export function getTotalLogisticsFee(shipment: ShipmentCosts): number {
  return (
    (shipment.local_delivery_fee || 0) +
    (shipment.cargo_fee || 0) +
    (shipment.packaging_fee || 0)
  );
}

// Yordamchi
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
