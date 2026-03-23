import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, Package, Truck, CheckSquare, DollarSign, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AnalyticsData, AnalyticsView } from '@/hooks/useAIAnalytics';

interface Props {
  data: AnalyticsData;
  view: AnalyticsView;
}

const PLATFORM_COLORS: Record<string, string> = {
  uzum: '#6C5CE7', yandex: '#FDCB6E', 'direct': '#00B894', boshqa: '#74B9FF',
};

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ── TODAY STATS ──────────────────────────────────────────
function TodayView({ data }: { data: AnalyticsData }) {
  const { today, weekly, platformBreakdown } = data;
  const stats = [
    { label: 'Buyurtmalar', value: today.orders,              icon: ShoppingCart, color: 'text-blue-500' },
    { label: 'Daromad',     value: `${fmt(today.revenue)} UZS`,     icon: DollarSign,   color: 'text-green-500' },
    { label: 'Komissiya',   value: `${fmt(today.commission)} UZS`,  icon: TrendingDown, color: 'text-orange-500' },
    { label: 'Sof Foyda',   value: `${fmt(today.netProfit)} UZS`,   icon: TrendingUp,   color: today.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500' },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="bg-muted/40 rounded-lg p-2.5 flex items-center gap-2">
            <s.icon className={cn('h-4 w-4 flex-shrink-0', s.color)} />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-xs font-semibold truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>
      {weekly.trend.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Haftalik daromad trendi</p>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={weekly.trend} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => fmt(v)} />
              <Tooltip formatter={(v: number) => [`${fmt(v)} UZS`, 'Daromad']} labelFormatter={(l) => l} />
              <Bar dataKey="revenue" fill="#6C5CE7" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {platformBreakdown.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Platforma bo'yicha (hafta)</p>
          <div className="flex gap-2 flex-wrap">
            {platformBreakdown.map((p, i) => (
              <div key={i} className="flex items-center gap-1 text-xs bg-muted/30 rounded px-2 py-1">
                <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[p.platform.toLowerCase()] || '#B2BEC3' }} />
                <span className="capitalize">{p.platform}:</span>
                <span className="font-medium">{fmt(p.revenue)} UZS</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PROBLEMS ─────────────────────────────────────────────
function ProblemsView({ data }: { data: AnalyticsData }) {
  const { problems, inventory } = data;
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
            p.severity === 'critical' ? 'bg-red-50 border-red-500' : 'bg-amber-50 border-amber-400'
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
      {/* Inventory donut */}
      <div className="flex items-center gap-3 pt-1">
        <PieChart width={70} height={70}>
          <Pie data={[
            { name: 'Yaxshi', value: inventory.healthy },
            { name: 'Kam', value: inventory.lowStock },
            { name: 'Tugadi', value: inventory.outOfStock },
          ]} cx={32} cy={32} innerRadius={20} outerRadius={32} dataKey="value" stroke="none">
            <Cell fill="#00B894" />
            <Cell fill="#FDCB6E" />
            <Cell fill="#D63031" />
          </Pie>
        </PieChart>
        <div className="text-[10px] space-y-0.5">
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{inventory.healthy} ta yaxshi</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{inventory.lowStock} ta kam</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{inventory.outOfStock} ta tugadi</div>
        </div>
      </div>
    </div>
  );
}

// ── TOP PRODUCTS ─────────────────────────────────────────
function TopProductsView({ data }: { data: AnalyticsData }) {
  const { topProducts } = data;
  if (!topProducts.length) return <p className="text-sm text-muted-foreground py-2">Bu hafta sotuv ma'lumoti yo'q.</p>;
  return (
    <div className="space-y-1.5">
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={topProducts.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => fmt(v)} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} tickFormatter={(n) => n.length > 14 ? n.slice(0, 14) + '…' : n} />
          <Tooltip formatter={(v: number, name) => [name === 'qty' ? `${v} ta` : `${fmt(v)} UZS`, name === 'qty' ? 'Miqdor' : 'Daromad']} />
          <Bar dataKey="qty" fill="#6C5CE7" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {topProducts.slice(0, 5).map((p, i) => (
        <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-muted-foreground w-4">{i + 1}.</span>
            <span className="truncate max-w-[140px]">{p.name}</span>
          </span>
          <span className="font-medium">{p.qty} ta · {fmt(p.revenue)} UZS</span>
        </div>
      ))}
    </div>
  );
}

// ── INVENTORY ────────────────────────────────────────────
function InventoryView({ data }: { data: AnalyticsData }) {
  const { inventory } = data;
  const issues = inventory.products.filter((p) => p.isLowStock || p.isOutOfStock);
  const healthy = inventory.products.filter((p) => !p.isLowStock && !p.isOutOfStock).slice(0, 8);
  return (
    <div className="space-y-2">
      {issues.length > 0 && (
        <div>
          <p className="text-[10px] text-red-500 font-medium mb-1">⚠️ Diqqat talab qiluvchi mahsulotlar</p>
          {issues.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-dashed last:border-0">
              <span className="truncate max-w-[150px]">{p.name}</span>
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
      <div>
        <p className="text-[10px] text-muted-foreground mb-1">Ombordagi mahsulotlar (tannarx bilan)</p>
        {healthy.map((p, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-dashed last:border-0">
            <span className="truncate max-w-[150px]">{p.name}</span>
            <span className="text-muted-foreground">{p.stock} dona · {p.landedCostUzs.toLocaleString()} UZS</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LOGISTICS ────────────────────────────────────────────
function LogisticsView({ data }: { data: AnalyticsData }) {
  const { logistics } = data;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/40 rounded p-2"><p className="text-lg font-bold">{logistics.total}</p><p className="text-[10px] text-muted-foreground">Quti jami</p></div>
        <div className="bg-amber-50 rounded p-2"><p className="text-lg font-bold text-amber-600">{logistics.delayed}</p><p className="text-[10px] text-muted-foreground">Kechikkan</p></div>
        <div className="bg-muted/40 rounded p-2"><p className="text-lg font-bold">{logistics.feePerGram.toFixed(4)}</p><p className="text-[10px] text-muted-foreground">CNY/gramm</p></div>
      </div>
      {(logistics.boxes as Array<Record<string, unknown>>).map((b, i) => (
        <div key={i} className="flex items-center justify-between text-xs bg-muted/20 rounded px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <Truck className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{String(b.box_number || 'N/A')}</span>
            <Badge variant="outline" className={cn('text-[9px] h-4', (b.daysInTransit as number) > 10 ? 'border-amber-400 text-amber-600' : '')}>
              {String(b.status)}
              {(b.daysInTransit as number) > 0 && ` · ${b.daysInTransit as number}k`}
            </Badge>
          </div>
          <span className="text-muted-foreground">{Number(b.weight_kg) || 0} kg</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────
export function AliAIAnalyticsPanel({ data, view }: Props) {
  const { title, icon: Icon } = useMemo(() => {
    const map: Record<AnalyticsView, { title: string; icon: typeof TrendingUp }> = {
      'today':        { title: 'Bugungi Statistika',      icon: TrendingUp },
      'problems':     { title: 'Muammolar Tahlili',        icon: AlertTriangle },
      'top-products': { title: 'TOP Mahsulotlar (Hafta)',  icon: ShoppingCart },
      'inventory':    { title: 'Inventar Holati',          icon: Package },
      'logistics':    { title: 'Logistika',                icon: Truck },
    };
    return map[view] || { title: 'Tahlil', icon: TrendingUp };
  }, [view]);

  return (
    <div className="max-w-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
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
