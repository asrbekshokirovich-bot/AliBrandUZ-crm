/**
 * Vercel Serverless Function: AI Analytics Brain
 * GET /api/ai-analytics
 * Returns structured JSON for charts/tables (not streaming text).
 * Auth: Bearer <supabase_jwt>
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_wk3pW4CAxzc90nks94MRHw_meKO-VWe';

// ── Supabase REST helper ────────────────────────────────
async function dbGet(table: string, query: string, userToken: string) {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: userToken ? `Bearer ${userToken}` : `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  return res.json();
}

// ── JWT decode (same as ceo-ai.ts) ─────────────────────
function decodeToken(token: string): { sub?: string; email?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    if (!payload.sub) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

const CNY_TO_UZS = 1750;

// ── Main handler ────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });

  // ── Auth ──────────────────────────────────────────────
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  const user = token ? decodeToken(token) : null;
  if (!user?.sub) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

  // ── Fetch data in parallel ────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [products, boxes, todayOrders, weekOrders, weekFinance, tasks] = await Promise.all([
    dbGet('products', 'select=id,name,sku,cost_price,purchase_currency,tashkent_manual_stock,weight,status&status=neq.archived&limit=100&order=updated_at.desc', token),
    dbGet('boxes', 'select=id,box_number,status,weight_kg,local_delivery_fee,cargo_fee,packaging_fee,created_at&limit=30&order=created_at.desc', token),
    dbGet('marketplace_orders', `select=product_name,platform,quantity,total_revenue,commission_fee,created_at&created_at=gte.${today}T00:00:00`, token),
    dbGet('marketplace_orders', `select=product_name,platform,quantity,total_revenue,commission_fee,created_at&created_at=gte.${weekAgo}`, token),
    dbGet('finance_transactions', `select=transaction_type,amount,category,description,created_at&created_at=gte.${weekAgo}&limit=200`, token),
    dbGet('tasks', 'select=id,title,status,due_date,priority&status=in.(todo,in_progress)&limit=50', token),
  ]);

  // ── Logistics cost calculation ────────────────────────
  type BoxData = Record<string, unknown>;
  const boxesEnriched = (boxes as BoxData[]).map((b) => {
    const lg = (Number(b.local_delivery_fee) || 0) + (Number(b.cargo_fee) || 0) + (Number(b.packaging_fee) || 0);
    const wg = (Number(b.weight_kg) || 0) * 1000;
    const fpg = wg > 0 ? lg / wg : 0;
    const days = b.status === 'in_transit'
      ? Math.floor((Date.now() - new Date(b.created_at as string).getTime()) / 86400000)
      : 0;
    return { ...b, totalLogistics: lg, feePerGram: fpg, daysInTransit: days };
  });

  const bestFpg = boxesEnriched.find((b) => b.feePerGram > 0)?.feePerGram ?? 0;

  // ── Products with landed cost & margin ────────────────
  type Product = {
    name: string; sku: string; stock: number;
    priceCny: number; weightG: number;
    landedCostCny: number; landedCostUzs: number;
    isLowStock: boolean; isOutOfStock: boolean; hasNoWeight: boolean;
  };

  const productsEnriched: Product[] = (products as BoxData[]).map((p) => {
    const priceCny    = Number(p.cost_price) || 0;
    const weightG     = (Number(p.weight) || 0) * 1000;
    const logShare    = weightG * bestFpg;
    const landedCny   = priceCny + logShare;
    const landedUzs   = Math.round(landedCny * CNY_TO_UZS);
    const stock       = Number(p.tashkent_manual_stock) ?? 0;
    return {
      name:           p.name as string,
      sku:            (p.sku as string) || '-',
      stock,
      priceCny,
      weightG,
      landedCostCny:  Math.round(landedCny * 100) / 100,
      landedCostUzs:  landedUzs,
      isLowStock:     stock > 0 && stock < 5,
      isOutOfStock:   stock <= 0,
      hasNoWeight:    weightG === 0,
    };
  });

  // ── Today ─────────────────────────────────────────────
  type Order = Record<string, unknown>;
  const calcOrders = (arr: Order[]) => ({
    count:      arr.length,
    revenue:    arr.reduce((s, o) => s + (Number(o.total_revenue) || 0), 0),
    commission: arr.reduce((s, o) => s + (Number(o.commission_fee) || 0), 0),
  });

  const todayCalc = calcOrders(todayOrders as Order[]);
  const todayNet  = todayCalc.revenue - todayCalc.commission;

  // ── Weekly finance ────────────────────────────────────
  const wf = weekFinance as Order[];
  const weekIncome  = wf.filter((t) => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const weekExpense = wf.filter((t) => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  // ── Weekly orders by day ──────────────────────────────
  const dayMap: Record<string, { revenue: number; orders: number }> = {};
  for (const o of weekOrders as Order[]) {
    const d = (o.created_at as string).split('T')[0];
    if (!dayMap[d]) dayMap[d] = { revenue: 0, orders: 0 };
    dayMap[d].revenue += Number(o.total_revenue) || 0;
    dayMap[d].orders  += 1;
  }
  const weeklyTrend = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // ── Top products by order quantity ───────────────────
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const o of weekOrders as Order[]) {
    const n = (o.product_name as string) || 'Noma\'lum';
    if (!productSales[n]) productSales[n] = { name: n, qty: 0, revenue: 0 };
    productSales[n].qty     += Number(o.quantity) || 1;
    productSales[n].revenue += Number(o.total_revenue) || 0;
  }
  const topProducts = Object.values(productSales)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // ── Problems ──────────────────────────────────────────
  const outOfStock   = productsEnriched.filter((p) => p.isOutOfStock);
  const lowStock     = productsEnriched.filter((p) => p.isLowStock);
  const delayed      = boxesEnriched.filter((b) => b.daysInTransit > 10);
  const overdueTasks = (tasks as BoxData[]).filter((t) => t.due_date && new Date(t.due_date as string) < new Date());

  type Problem = { type: string; severity: 'critical' | 'warning'; title: string; description: string; count: number };
  const problems: Problem[] = [];
  if (outOfStock.length)   problems.push({ type: 'out_of_stock',   severity: 'critical', count: outOfStock.length,   title: 'Zaxira tugadi',          description: outOfStock.slice(0,5).map((p) => p.name).join(', ') });
  if (lowStock.length)     problems.push({ type: 'low_stock',      severity: 'warning',  count: lowStock.length,     title: 'Zaxira kam (<5 dona)',    description: lowStock.slice(0,5).map((p) => `${p.name}: ${p.stock} dona`).join(', ') });
  if (delayed.length)      problems.push({ type: 'delayed',        severity: 'warning',  count: delayed.length,      title: 'Kechikkan jo\'natmalar',  description: delayed.map((b) => `${b.box_number} — ${b.daysInTransit}+ kun`).join(', ') });
  if (overdueTasks.length) problems.push({ type: 'overdue_tasks',  severity: 'warning',  count: overdueTasks.length, title: 'Muddati o\'tgan vazifalar', description: overdueTasks.slice(0,3).map((t) => t.title as string).join(', ') });

  // ── Platform breakdown ────────────────────────────────
  const platformMap: Record<string, { revenue: number; orders: number }> = {};
  for (const o of weekOrders as Order[]) {
    const p = (o.platform as string) || 'Boshqa';
    if (!platformMap[p]) platformMap[p] = { revenue: 0, orders: 0 };
    platformMap[p].revenue += Number(o.total_revenue) || 0;
    platformMap[p].orders  += 1;
  }
  const platformBreakdown = Object.entries(platformMap).map(([platform, v]) => ({ platform, ...v }));

  // ── Response ──────────────────────────────────────────
  const response = {
    generatedAt: new Date().toISOString(),
    today: {
      date:       today,
      orders:     todayCalc.count,
      revenue:    todayCalc.revenue,
      commission: todayCalc.commission,
      netProfit:  todayNet,
    },
    weekly: {
      income:  weekIncome,
      expense: weekExpense,
      net:     weekIncome - weekExpense,
      trend:   weeklyTrend,
    },
    inventory: {
      total:       productsEnriched.length,
      outOfStock:  outOfStock.length,
      lowStock:    lowStock.length,
      healthy:     productsEnriched.length - outOfStock.length - lowStock.length,
      products:    productsEnriched.slice(0, 20),
    },
    logistics: {
      total:    boxesEnriched.length,
      delayed:  delayed.length,
      boxes:    boxesEnriched.slice(0, 10),
      feePerGram: bestFpg,
    },
    tasks: {
      total:   (tasks as BoxData[]).length,
      overdue: overdueTasks.length,
    },
    problems,
    topProducts,
    platformBreakdown,
  };

  return Response.json(response, { headers: { ...cors, 'Cache-Control': 'no-store' } });
}

export const config = { runtime: 'edge' };
