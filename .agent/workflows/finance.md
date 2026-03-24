---
description: Manage financial calculations, currency exchange, and cost formulas
---

# /finance — Financial Calculations Workflow

Handle all financial logic for alicargo-joy-main (UZS/USD/CNY calculations).

## Core Formula: Proportional Weight-Based Landed Cost
```typescript
/**
 * AliBrand's standard landed cost formula
 * Used for all product cost calculations
 */
function calculateLandedCost(item: {
  unit_cost_usd: number;
  weight_kg: number;
  quantity: number;
}, shipping: {
  total_cost_usd: number;
  total_weight_kg: number;
}, exchangeRate: number, packagingFeeUSD: number = 0): number {
  const itemTotalWeight = item.weight_kg * item.quantity;
  const shippingShare = (itemTotalWeight / shipping.total_weight_kg) * shipping.total_cost_usd;
  
  const perItemCostUSD = item.unit_cost_usd + (shippingShare / item.quantity) + packagingFeeUSD;
  const perItemCostUZS = perItemCostUSD * exchangeRate;
  
  return Math.round(perItemCostUZS);
}
```

## Exchange Rate Fetching
```typescript
// Get current rates from the exchange-rates Edge Function
const { data: rates } = await supabase.functions.invoke('exchange-rates');
// Returns: { usd_to_uzs: 12850, cny_to_uzs: 1780, ... }

// Or query from DB (rates are cached)
const { data: rate } = await supabase
  .from('exchange_rates')
  .select('rate')
  .eq('currency_pair', 'USD_UZS')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();
```

## Financial Report Queries
```sql
-- Daily sales total
SELECT 
  DATE(created_at) as date,
  SUM(quantity * price_uzs) as revenue_uzs,
  COUNT(*) as total_orders
FROM direct_sales
WHERE payment_status = 'paid'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Profit margin per product
SELECT 
  p.name,
  p.price_uzs as sell_price,
  p.landed_cost_uzs as cost,
  (p.price_uzs - p.landed_cost_uzs) as profit,
  ROUND(((p.price_uzs - p.landed_cost_uzs) / p.price_uzs) * 100) as margin_pct
FROM products p
WHERE p.status = 'active'
ORDER BY margin_pct DESC;
```

## Currency Formatting
```typescript
// Format UZS amounts
const formatUZS = (amount: number) => 
  new Intl.NumberFormat('uz-UZ', { 
    style: 'currency', 
    currency: 'UZS',
    maximumFractionDigits: 0 
  }).format(amount);
// Output: "125 000 UZS"

// Format USD amounts  
const formatUSD = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
```

## Finance Edge Functions
```
daily-finance-summary         ← Daily P&L summary (triggered by cron)
sync-marketplace-finance      ← Sync financial data from marketplaces
calculate-financial-period    ← Monthly/quarterly reports
exchange-rates               ← Fetch latest USD/CNY rates
```

## Common Finance Calculations

### Profit Margin
```typescript
const margin = ((sellPrice - costPrice) / sellPrice) * 100;
```

### Shipping Cost Per Item
```typescript
const shippingPerItem = (item.weight / totalShipmentWeight) * totalShippingCost / item.quantity;
```

### ROI
```typescript
const roi = ((revenue - totalCost) / totalCost) * 100;
```

## Usage
```
/finance "recalculate landed cost for all products after exchange rate change"
/finance "create monthly P&L report"
/finance "add shipping cost breakdown to product detail page"
```
