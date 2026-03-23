import { useMemo } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Package, Truck, CheckSquare, DollarSign, ShoppingCart, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AnalyticsData, AnalyticsView } from '@/hooks/useAIAnalytics';

interface Props {
  data: AnalyticsData;
  view: AnalyticsView;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

// ── CSS Progress bar ────────────────
function ProgressBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Stat card ───────────────────────
function StatCard({ label, value, sub, icon: Icon, iconColor }: { label: string; value: string | number; sub?: string; icon: React.ElementType; iconColor: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5 flex items-start gap-2">
      <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', iconColor)} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold truncate">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── TODAY VIEW ──────────────────────
function TodayView({ data }: { data: AnalyticsData }) {
  const { today, weekly, platformBreakdown } = data;
  const maxRev = Math.max(...(weekly.trend.map((d) => d.revenue)), 1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Buyurtmalar" value={today.orders} icon={ShoppingCart} iconColor="text-blue-500" />
        <StatCard label="Daromad" value={`${fmt(today.revenue)} UZS`} icon={DollarSign} iconColor="text-green-500" />
        <StatCard label="Komissiya" value={`${fmt(today.commission)} UZS`} icon={TrendingDown} iconColor="text-orange-500" />
        <StatCard
          label="Sof Foyda"
          value={`${fmt(today.netProfit)} UZS`}
          icon={TrendingUp}
          iconColor={today.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}
        />
      </div>

      {/* Weekly trend bar chart (CSS) */}
      {weekly.trend.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Haftalik daromad trendi</p>
          <div className="flex items-end gap-1 h-14">
            {weekly.trend.slice(-7).map((d, i) => {
              const pct = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full bg-primary/80 rounded-t-sm" style={{ height: `${Math.max(pct, 4)}%`, minHeight: 2 }} title={`${fmt(d.revenue)} UZS`} />
                  <span className="text-[8px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Platform breakdown */}
      {platformBreakdown.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Platforma bo'yicha</p>
          <div className="flex gap-2 flex-wrap">
            {platformBreakdown.map((p, i) => (
              <span key={i} className="text-[10px] bg-muted/50 rounded px-2 py-0.5 font-medium">
                {p.platform}: {fmt(p.revenue)} UZS ({p.orders} ta)
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground border-t pt-2">
        Haftalik: kirim {fmt(weekly.income)} · chiqim {fmt(weekly.expense)} · sof {fmt(weekly.net)} UZS
      </div>
    </div>
  );
}

// ── PROBLEMS VIEW ───────────────────
function ProblemsView({ data }: { data: AnalyticsData }) {
  const { problems, inventory } = data;
  const total = inventory.total || 1;

  return (
    <div className="space-y-2">
      {problems.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          <CheckSquare className="h-6 w-6 mx-auto mb-1 text-green-500" />
          Hozircha jiddiy muammo yo'q ✅
        </div>
      ) : (
        problems.map((p, i) => (
          <div key={i} className={cn(
            'rounded-lg p-2.5 border-l-4 text-xs',
            p.severity === 'critical' ? 'bg-red-50 border-red-500 dark:bg-red-950/30' : 'bg-amber-50 border-amber-400 dark:bg-amber-950/30'
          )}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <AlertTriangle className={cn('h-3 w-3 flex-shrink-0', p.severity === 'critical' ? 'text-red-500' : 'text-amber-500')} />
              <span className="font-semibold">{p.title}</span>
              <Badge variant="outline" className="text-[9px] h-4 ml-auto">{p.count} ta</Badge>
            </div>
            <p className="text-muted-foreground text-[10px] leading-relaxed">{p.description}</p>
          </div>
        ))
      )}

      {/* Inventory breakdown bars */}
      <div className="pt-1 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">Inventar holati</p>
        {[
          { label: 'Yaxshi', count: inventory.healthy, color: 'bg-emerald-500' },
          { label: 'Kam (<5)', count: inventory.lowStock, color: 'bg-amber-400' },
          { label: 'Tugadi', count: inventory.outOfStock, color: 'bg-red-500' },
        ].map((row, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="w-14 text-muted-foreground">{row.label}</span>
            <div className="flex-1"><ProgressBar value={row.count} max={total} color={row.color} /></div>
            <span className="w-8 text-right font-medium">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TOP PRODUCTS VIEW ───────────────
function TopProductsView({ data }: { data: AnalyticsData }) {
  const { topProducts } = data;
  if (!topProducts.length) return <p className="text-sm text-muted-foreground py-2">Bu hafta sotuv ma'lumoti yo'q.</p>;
  const maxQty = Math.max(...topProducts.map((p) => p.qty), 1);

  return (
    <div className="space-y-1.5">
      {topProducts.slice(0, 8).map((p, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1">
              <span className="font-bold text-muted-foreground w-3">{i + 1}.</span>
              <span className="truncate max-w-[160px]">{p.name}</span>
            </span>
            <span className="font-medium flex-shrink-0">{p.qty} ta · {fmt(p.revenue)} UZS</span>
          </div>
          <ProgressBar value={p.qty} max={maxQty} color={i === 0 ? 'bg-primary' : 'bg-primary/60'} />
        </div>
      ))}
    </div>
  );
}

// ── INVENTORY VIEW ──────────────────
function InventoryView({ data }: { data: AnalyticsData }) {
  const { inventory } = data;
  const issues = inventory.products.filter((p) => p.isLowStock || p.isOutOfStock);
  const healthy = inventory.products.filter((p) => !p.isLowStock && !p.isOutOfStock).slice(0, 6);

  return (
    <div className="space-y-2">
      {issues.length > 0 && (
        <div>
          <p className="text-[10px] text-red-500 font-semibold mb-1">⚠️ Diqqat talab qiluvchi</p>
          {issues.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-dashed last:border-0">
              <span className="truncate max-w-[140px]">{p.name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-muted-foreground">{p.landedCostUzs.toLocaleString()} UZS</span>
                <Badge variant={p.isOutOfStock ? 'destructive' : 'outline'} className="text-[9px] h-4">
                  {p.isOutOfStock ? 'TUGADI' : `${p.stock} dona`}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      {healthy.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Ombordagi mahsulotlar</p>
          {healthy.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-dashed last:border-0">
              <span className="truncate max-w-[140px]">{p.name}</span>
              <span className="text-muted-foreground flex-shrink-0">{p.stock} dona · {p.landedCostUzs.toLocaleString()} UZS</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LOGISTICS VIEW ──────────────────
function LogisticsView({ data }: { data: AnalyticsData }) {
  const { logistics } = data;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/40 rounded p-2">
          <p className="text-base font-bold">{logistics.total}</p>
          <p className="text-[10px] text-muted-foreground">Quti jami</p>
        </div>
        <div className={cn('rounded p-2', logistics.delayed > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/40')}>
          <p className={cn('text-base font-bold', logistics.delayed > 0 ? 'text-amber-600' : '')}>{logistics.delayed}</p>
          <p className="text-[10px] text-muted-foreground">Kechikkan</p>
        </div>
        <div className="bg-muted/40 rounded p-2">
          <p className="text-base font-bold">{logistics.feePerGram.toFixed(4)}</p>
          <p className="text-[10px] text-muted-foreground">CNY/gramm</p>
        </div>
      </div>
      {(logistics.boxes as Array<Record<string, unknown>>).map((b, i) => (
        <div key={i} className="flex items-center justify-between text-xs bg-muted/20 rounded px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <Truck className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{String(b.box_number || 'N/A')}</span>
            <Badge variant="outline" className={cn('text-[9px] h-4', (b.daysInTransit as number) > 10 ? 'border-amber-400 text-amber-600' : '')}>
              {String(b.status)}{(b.daysInTransit as number) > 0 ? ` · ${b.daysInTransit as number}k` : ''}
            </Badge>
          </div>
          <span className="text-muted-foreground">{Number(b.weight_kg) || 0} kg</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Panel ──────────────────────
export function AliAIAnalyticsPanel({ data, view }: Props) {
  const meta = useMemo(() => {
    const map: Record<AnalyticsView, { title: string; icon: React.ElementType }> = {
      'today':        { title: 'Bugungi Statistika',      icon: Activity },
      'problems':     { title: 'Muammolar Tahlili',        icon: AlertTriangle },
      'top-products': { title: 'TOP Mahsulotlar (Hafta)',  icon: ShoppingCart },
      'inventory':    { title: 'Inventar Holati',          icon: Package },
      'logistics':    { title: 'Logistika',                icon: Truck },
    };
    return map[view] || { title: 'Tahlil', icon: TrendingUp };
  }, [view]);

  const { title, icon: Icon } = meta;

  return (
    <div className="max-w-sm w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Card className="border border-primary/20 shadow-sm">
        <CardHeader className="py-2 px-3 border-b bg-primary/5">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Icon className="h-4 w-4 text-primary" />
            {title}
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              {new Date(data.generatedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {view === 'today'        && <TodayView data={data} />}
          {view === 'problems'     && <ProblemsView data={data} />}
          {view === 'top-products' && <TopProductsView data={data} />}
          {view === 'inventory'    && <InventoryView data={data} />}
          {view === 'logistics'    && <LogisticsView data={data} />}
        </CardContent>
      </Card>
    </div>
  );
}
