import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from '@/lib/fetchAllRows';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";


import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  BarChart3,
  Brain,
  RefreshCw,
  ShoppingCart,
  AlertTriangle,
  Target,
  LineChart,
  PieChart,
  Percent,
  Receipt,
  Store,
  Calendar,
  ChevronDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays, startOfDay, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";

type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'custom';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#84cc16',
  '#a855f7',
];

const UZUM_COLORS = ['#a855f7', '#8b5cf6', '#7c3aed', '#6d28d9', '#c084fc', '#d8b4fe', '#9333ea', '#581c87'];
const YANDEX_COLORS = ['#f59e0b', '#d97706', '#b45309', '#fbbf24'];

type PlatformTab = 'all' | 'uzum' | 'yandex';

export default function MarketplaceAnalytics() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("sales");
  const [platformTab, setPlatformTab] = useState<PlatformTab>('all');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // === Period filter state ===
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Derived start/end dates from preset
  const { startDate, endDate, periodLabel, shortLabel } = useMemo(() => {
    const now = new Date();
    switch (periodPreset) {
      case 'today':
        return {
          startDate: startOfDay(now),
          endDate: now,
          periodLabel: 'Bugun — ' + format(now, 'dd.MM.yyyy'),
          shortLabel: 'Bugun',
        };
      case '7d':
        return {
          startDate: subDays(now, 7),
          endDate: now,
          periodLabel: format(subDays(now, 7), 'dd.MM') + ' – ' + format(now, 'dd.MM.yyyy'),
          shortLabel: 'Oxirgi 7 kun',
        };
      case '30d':
        return {
          startDate: subDays(now, 30),
          endDate: now,
          periodLabel: format(subDays(now, 30), 'dd.MM') + ' – ' + format(now, 'dd.MM.yyyy'),
          shortLabel: 'Oxirgi 30 kun',
        };
      case '90d':
        return {
          startDate: subDays(now, 90),
          endDate: now,
          periodLabel: format(subDays(now, 90), 'dd.MM') + ' – ' + format(now, 'dd.MM.yyyy'),
          shortLabel: 'Oxirgi 90 kun',
        };
      case 'custom': {
        const from = customFrom ? new Date(customFrom) : subDays(now, 30);
        const to = customTo ? new Date(customTo) : now;
        return {
          startDate: from,
          endDate: to,
          periodLabel: format(from, 'dd.MM.yyyy') + ' – ' + format(to, 'dd.MM.yyyy'),
          shortLabel: format(from, 'dd.MM') + ' – ' + format(to, 'dd.MM'),
        };
      }
    }
  }, [periodPreset, customFrom, customTo]);

  // Fetch stores
  const { data: stores } = useQuery({
    queryKey: ['marketplace-stores-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_stores')
        .select('id, name, platform')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription — auto-refresh analytics on order changes
  useEffect(() => {
    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'marketplace_orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['mp-analytics-finance-summary'] });
          queryClient.invalidateQueries({ queryKey: ['mp-analytics-today'] });
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'marketplace_orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['mp-analytics-finance-summary'] });
          queryClient.invalidateQueries({ queryKey: ['mp-analytics-today'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // TODAY live stats: sales + returns breakdown per platform
  const { data: todayStats } = useQuery({
    queryKey: ['mp-analytics-today'],
    queryFn: async () => {
      const todayStart = startOfDay(new Date()).toISOString();
      const { data, error } = await supabase
        .from('marketplace_orders')
        .select('store_id, total_amount, status, marketplace_stores!inner(platform)')
        .gte('ordered_at', todayStart);
      if (error) throw error;
      const result = { uzum: { orders: 0, revenue: 0, returns: 0 }, yandex: { orders: 0, revenue: 0, returns: 0 } };
      for (const o of data || []) {
        const platform = (o.marketplace_stores as any)?.platform as 'uzum' | 'yandex';
        if (!result[platform]) continue;
        const st = (o.status || '').toUpperCase();
        if (st.includes('RETURN')) {
          result[platform].returns++;
        } else {
          result[platform].orders++;
          result[platform].revenue += o.total_amount || 0;
        }
      }
      return result;
    },
    refetchInterval: 30000,
  });


  // PRIMARY data source: aggregate from marketplace_orders with dynamic date range
  const { data: financeSummary, isLoading: financeLoading, refetch: refetchFinance } = useQuery({
    queryKey: ['mp-analytics-finance-summary', startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_orders')
        .select('store_id, ordered_at, total_amount, commission, status')
        .gte('ordered_at', startDate.toISOString())
        .lte('ordered_at', endDate.toISOString());
      if (error) throw error;

      // Aggregate by store + date
      const map: Record<string, {
        store_id: string; period_date: string; period_type: string;
        orders_count: number; gross_revenue: number; commission_total: number;
        delivered_count: number; cancelled_count: number; returned_count: number;
      }> = {};

      for (const order of data || []) {
        const date = (order.ordered_at || '').slice(0, 10);
        if (!date) continue;
        const key = `${order.store_id}:${date}`;
        if (!map[key]) {
          map[key] = {
            store_id: order.store_id, period_date: date, period_type: 'daily',
            orders_count: 0, gross_revenue: 0, commission_total: 0,
            delivered_count: 0, cancelled_count: 0, returned_count: 0,
          };
        }
        const r = map[key];
        r.orders_count++;
        r.gross_revenue += order.total_amount || 0;
        r.commission_total += order.commission || 0;
        const st = (order.status || '').toUpperCase();
        if (['DELIVERED','COMPLETED','DONE','ARRIVED'].some(s => st.includes(s))) r.delivered_count++;
        if (['CANCELLED','CANCELED','REJECTED'].some(s => st.includes(s))) r.cancelled_count++;
        if (st.includes('RETURN')) r.returned_count++;
      }
      return Object.values(map);
    },
    staleTime: 60000,
  });


  // Lightweight: pending count only
  const { data: pendingCount } = useQuery({
    queryKey: ['mp-analytics-pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('marketplace_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['CREATED', 'PENDING', 'PACKING', 'PENDING_DELIVERY']);
      if (error) throw error;
      return count || 0;
    },
    staleTime: 60000,
  });

  // Fetch listings for product analytics
  const { data: listings, isLoading: listingsLoading } = useQuery({
    queryKey: ['marketplace-listings-analytics'],
    queryFn: async () => {
      return await fetchAllRows(
        supabase
          .from('marketplace_listings')
          .select(`
            id, title, price, stock, status, product_rank, store_id, external_sku,
            marketplace_stores(name, platform)
          `)
      );
    },
  });

  // Listings count queries
  const { data: listingsCount } = useQuery({
    queryKey: ['marketplace-listings-count'],
    queryFn: async () => {
      const [activeResult, lowStockResult, outOfStockResult] = await Promise.all([
        supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }).gt('stock', 0).lt('stock', 5),
        supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }).eq('stock', 0).eq('status', 'active'),
      ]);
      return {
        activeCount: activeResult.count || 0,
        lowStockCount: lowStockResult.count || 0,
        outOfStockCount: outOfStockResult.count || 0,
      };
    },
  });

  // Per-store listing counts (fast: N parallel COUNT queries, no join, no row-limit issues)
  const { data: storeListingCounts } = useQuery({
    queryKey: ['marketplace-store-listing-counts', stores?.map(s => s.id).join(',')],
    enabled: !!stores?.length,
    staleTime: 120000,
    queryFn: async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        (stores || []).map(async (store) => {
          const { count } = await supabase
            .from('marketplace_listings')
            .select('*', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .eq('status', 'active');
          counts[store.id] = count || 0;
        })
      );
      return counts;
    },
  });


  // === Platform store splits ===
  const uzumStores = useMemo(() => stores?.filter(s => s.platform === 'uzum') || [], [stores]);
  const yandexStores = useMemo(() => stores?.filter(s => s.platform === 'yandex') || [], [stores]);

  const platformStores = useMemo(() => {
    if (platformTab === 'uzum') return uzumStores;
    if (platformTab === 'yandex') return yandexStores;
    return stores || [];
  }, [platformTab, stores, uzumStores, yandexStores]);

  // === Filter summary by platform ===
  const summary = financeSummary || [];

  const platformSummary = useMemo(() => {
    let filtered = summary;
    if (platformTab !== 'all') {
      const platformStoreIds = new Set(
        (platformTab === 'uzum' ? uzumStores : yandexStores).map(s => s.id)
      );
      filtered = filtered.filter(r => platformStoreIds.has(r.store_id));
    }
    if (selectedStoreId) {
      filtered = filtered.filter(r => r.store_id === selectedStoreId);
    }
    return filtered;
  }, [platformTab, selectedStoreId, summary, uzumStores, yandexStores]);

  // === Filterlangan listings (platform + store bo'yicha) ===
  const filteredListingsForKPI = useMemo(() => {
    if (!listings) return [];
    let result = listings;
    if (platformTab !== 'all') {
      result = result.filter(l => (l.marketplace_stores as any)?.platform === platformTab);
    }
    if (selectedStoreId) {
      result = result.filter(l => l.store_id === selectedStoreId);
    }
    return result;
  }, [listings, platformTab, selectedStoreId]);

  const filteredActiveListings = filteredListingsForKPI.filter(l => l.status === 'active').length;
  const filteredLowStock = filteredListingsForKPI.filter(l => (l.stock ?? 0) > 0 && (l.stock ?? 0) < 5).length;
  const filteredOutOfStock = filteredListingsForKPI.filter(l => (l.stock ?? 0) === 0 && l.status === 'active').length;

  // === Compute KPIs from filtered summary ===
  const analytics = useMemo(() => ({
    totalRevenue: platformSummary.reduce((s, r) => s + (r.gross_revenue || 0), 0),
    totalCommission: platformSummary.reduce((s, r) => s + (r.commission_total || 0), 0),
    totalOrders: platformSummary.reduce((s, r) => s + (r.orders_count || 0), 0),
    completedOrders: platformSummary.reduce((s, r) => s + (r.delivered_count || 0), 0),
    cancelledOrders: platformSummary.reduce((s, r) => s + (r.cancelled_count || 0), 0),
    returnedOrders: platformSummary.reduce((s, r) => s + (r.returned_count || 0), 0),
    pendingOrders: pendingCount || 0,
    activeListings: filteredActiveListings,
    lowStockListings: filteredLowStock,
    outOfStockListings: filteredOutOfStock,
  }), [platformSummary, pendingCount, filteredActiveListings, filteredLowStock, filteredOutOfStock]);

  const netRevenue = analytics.totalRevenue - analytics.totalCommission;

  // === Revenue trend from filtered summary (group by period_date) ===
  const trendData = useMemo(() => {
    const trendByDate: Record<string, { revenue: number; orders: number }> = {};
    for (const row of platformSummary) {
      const date = format(new Date(row.period_date + 'T00:00:00'), 'MM-dd');
      if (!trendByDate[date]) trendByDate[date] = { revenue: 0, orders: 0 };
      trendByDate[date].revenue += row.gross_revenue || 0;
      trendByDate[date].orders += row.delivered_count || 0;
    }
    return Object.entries(trendByDate)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [platformSummary]);

  // === Base store revenue for chips (platform filtered, NOT store filtered) ===
  const baseStoreRevenue = useMemo(() => {
    let filtered = summary;
    if (platformTab !== 'all') {
      const platformStoreIds = new Set(
        (platformTab === 'uzum' ? uzumStores : yandexStores).map(s => s.id)
      );
      filtered = filtered.filter(r => platformStoreIds.has(r.store_id));
    }
    const map: Record<string, number> = {};
    for (const row of filtered) {
      map[row.store_id] = (map[row.store_id] || 0) + (row.gross_revenue || 0);
    }
    return map;
  }, [platformTab, summary, uzumStores, yandexStores]);

  // === Base store orders for mini cards (platform filtered, NOT store filtered) ===
  const baseStoreOrders = useMemo(() => {
    let filtered = summary;
    if (platformTab !== 'all') {
      const platformStoreIds = new Set(
        (platformTab === 'uzum' ? uzumStores : yandexStores).map(s => s.id)
      );
      filtered = filtered.filter(r => platformStoreIds.has(r.store_id));
    }
    const map: Record<string, number> = {};
    for (const row of filtered) {
      map[row.store_id] = (map[row.store_id] || 0) + (row.orders_count || 0);
    }
    return map;
  }, [platformTab, summary, uzumStores, yandexStores]);

  // === Store distribution — ALL platform stores, including those with 0 revenue ===
  const storeChartData = useMemo(() => {
    if (platformTab === 'all') {
      const revenueByStoreId: Record<string, number> = {};
      for (const row of platformSummary) {
        revenueByStoreId[row.store_id] = (revenueByStoreId[row.store_id] || 0) + (row.gross_revenue || 0);
      }
      return Object.entries(revenueByStoreId)
        .map(([storeId, value]) => ({
          storeId,
          name: stores?.find(s => s.id === storeId)?.name || 'Unknown',
          value,
        }))
        .sort((a, b) => b.value - a.value);
    }
    return platformStores
      .map(store => ({
        storeId: store.id,
        name: store.name,
        value: baseStoreRevenue[store.id] || 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [platformTab, platformSummary, platformStores, baseStoreRevenue, stores]);

  // === Uzum & Yandex separate chart data (clean: revenue first, listing counts as fallback) ===

  // Revenue per store (from finance summary)
  const uzumRevenueData = useMemo(() => {
    const uzumStoreIds = new Set(uzumStores.map(s => s.id));
    const rev: Record<string, number> = {};
    for (const row of summary) {
      if (uzumStoreIds.has(row.store_id))
        rev[row.store_id] = (rev[row.store_id] || 0) + (row.gross_revenue || 0);
    }
    return uzumStores.map(s => ({ storeId: s.id, name: s.name, value: rev[s.id] || 0 })).sort((a, b) => b.value - a.value);
  }, [uzumStores, summary]);

  const yandexRevenueData = useMemo(() => {
    const yandexStoreIds = new Set(yandexStores.map(s => s.id));
    const rev: Record<string, number> = {};
    for (const row of summary) {
      if (yandexStoreIds.has(row.store_id))
        rev[row.store_id] = (rev[row.store_id] || 0) + (row.gross_revenue || 0);
    }
    return yandexStores.map(s => ({ storeId: s.id, name: s.name, value: rev[s.id] || 0 })).sort((a, b) => b.value - a.value);
  }, [yandexStores, summary]);

  // Listing counts (from fast per-store COUNT queries)
  const uzumListingData = useMemo(() =>
    uzumStores.map(s => ({ storeId: s.id, name: s.name, value: storeListingCounts?.[s.id] || 0 }))
      .sort((a, b) => b.value - a.value),
    [uzumStores, storeListingCounts]);

  const yandexListingData = useMemo(() =>
    yandexStores.map(s => ({ storeId: s.id, name: s.name, value: storeListingCounts?.[s.id] || 0 }))
      .sort((a, b) => b.value - a.value),
    [yandexStores, storeListingCounts]);

  // Use revenue if any store has revenue > 0, otherwise use listing counts
  const uzumHasRevenue = uzumRevenueData.some(d => d.value > 0);
  const yandexHasRevenue = yandexRevenueData.some(d => d.value > 0);

  const uzumChartData = uzumHasRevenue ? uzumRevenueData : uzumListingData;
  const yandexChartData = yandexHasRevenue ? yandexRevenueData : yandexListingData;

  // True = show listing counts, False = show revenue percentages
  const uzumIsListingsMode = !uzumHasRevenue;
  const yandexIsListingsMode = !yandexHasRevenue;



  // === Per-store revenue & orders map (from filtered platformSummary, for KPI cards) ===
  const storeRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of platformSummary) {
      map[row.store_id] = (map[row.store_id] || 0) + (row.gross_revenue || 0);
    }
    return map;
  }, [platformSummary]);

  const storeOrders = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of platformSummary) {
      map[row.store_id] = (map[row.store_id] || 0) + (row.orders_count || 0);
    }
    return map;
  }, [platformSummary]);

  // Product rank distribution
  const rankDistribution = listings?.reduce((acc: Record<string, number>, l) => {
    const rank = l.product_rank || 'N';
    acc[rank] = (acc[rank] || 0) + 1;
    return acc;
  }, {}) || {};

  const rankChartData = ['A', 'B', 'C', 'D', 'N'].map(rank => ({
    name: rank === 'N' ? t('mpa_rank_new') : `${rank}-Rank`,
    value: rankDistribution[rank] || 0,
    fill: rank === 'A' ? '#22c55e' : rank === 'B' ? '#3b82f6' : rank === 'C' ? '#eab308' : rank === 'D' ? '#ef4444' : '#94a3b8',
  }));

  const topProducts = listings?.filter(l => l.product_rank === 'A').slice(0, 5) || [];
  const worstProducts = listings?.filter(l => l.product_rank === 'D' || (l.stock === 0 && l.status === 'active')).slice(0, 5) || [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchFinance();
      toast.success(t('mp_data_refreshed'));
    } catch (error) {
      toast.error(t('mp_refresh_error'));
    }
    setIsRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('uz-UZ').format(Math.round(amount)) + ' UZS';
  };

  // Platform color config
  const platformConfig = {
    all: { color: 'text-primary', bg: 'bg-primary/10', label: 'Barchasi' },
    uzum: { color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Uzum' },
    yandex: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Yandex Market' },
  };
  const cfg = platformConfig[platformTab];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            {t('mpa_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('mpa_subtitle')}
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={isRefreshing} className="w-full sm:w-auto min-h-[44px]">
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('mpa_refresh')}
        </Button>
      </div>

      {/* Platform Tabs */}
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'uzum', 'yandex'] as PlatformTab[]).map((pt) => {
            const pcfg = platformConfig[pt];
            const isActive = platformTab === pt;
            return (
              <button
                key={pt}
                onClick={() => {
                  setPlatformTab(pt);
                  setSelectedStoreId(null);
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${isActive
                  ? `${pcfg.bg} ${pcfg.color} border-current`
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                  }`}
              >
                {pt === 'all' ? '🌐 Barchasi' : pt === 'uzum' ? '🟣 Uzum' : '🟡 Yandex Market'}
                {pt !== 'all' && (
                  <span className="ml-1.5 opacity-60 text-xs">
                    ({pt === 'uzum' ? uzumStores.length : yandexStores.length} do'kon)
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Store chips — shown only when uzum or yandex is selected */}
        {platformTab !== 'all' && platformStores.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-1">
            <button
              onClick={() => setSelectedStoreId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!selectedStoreId
                ? 'bg-muted border-foreground/30 text-foreground'
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                }`}
            >
              Barchasi ({platformStores.length})
            </button>
            {platformStores.map(store => {
              const rev = baseStoreRevenue[store.id] || 0;
              const isSelected = selectedStoreId === store.id;
              return (
                <button
                  key={store.id}
                  onClick={() => setSelectedStoreId(isSelected ? null : store.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isSelected
                    ? `${cfg.bg} ${cfg.color} border-current`
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                    }`}
                >
                  {store.name}
                  {rev > 0 && (
                    <span className="ml-1 opacity-60">
                      {(rev / 1_000_000).toFixed(0)}M
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== PERIOD FILTER BAR ===== */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          {(
            [['today', 'Bugun'], ['7d', '7 kun'], ['30d', '30 kun'], ['90d', '90 kun']] as [PeriodPreset, string][]
          ).map(([preset, label]) => (
            <button
              key={preset}
              onClick={() => { setPeriodPreset(preset); setShowCustomPicker(false); }}
              className={`px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                periodPreset === preset && !showCustomPicker
                  ? 'bg-foreground text-background border-foreground shadow-sm'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
          {/* Custom date range button */}
          <button
            onClick={() => { setShowCustomPicker(v => !v); if (!showCustomPicker) setPeriodPreset('custom'); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
              periodPreset === 'custom'
                ? 'bg-foreground text-background border-foreground shadow-sm'
                : 'border-border text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {periodPreset === 'custom' && customFrom && customTo
              ? shortLabel
              : 'Boshqa sana'}
            <ChevronDown className={`h-3 w-3 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
          </button>

          {/* Active period label */}
          <span className="ml-auto text-xs text-muted-foreground font-medium border border-border/50 rounded-lg px-2.5 py-1 bg-muted/30">
            📅 {periodLabel}
          </span>
        </div>

        {/* Custom date inputs — inline */}
        {showCustomPicker && (
          <div className="flex items-center gap-3 pl-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Dan:</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || format(new Date(), 'yyyy-MM-dd')}
                onChange={e => { setCustomFrom(e.target.value); setPeriodPreset('custom'); }}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Gacha:</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={e => { setCustomTo(e.target.value); setPeriodPreset('custom'); }}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            {customFrom && customTo && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600/30 bg-green-50 dark:bg-green-900/20">
                ✓ {periodLabel}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Selected store badge */}
      {selectedStoreId && (() => {
        const selectedStore = stores?.find(s => s.id === selectedStoreId);
        if (!selectedStore) return null;
        const isUzum = selectedStore.platform === 'uzum';
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${isUzum ? 'border-purple-500/50 text-purple-600' : 'border-yellow-500/50 text-yellow-600'}`}>
              {isUzum ? '🟣' : '🟡'} {selectedStore.name}
              <button
                className="ml-1.5 hover:opacity-70"
                onClick={() => setSelectedStoreId(null)}
              >
                ✕
              </button>
            </Badge>
          </div>
        );
      })()}

      {/* Live Today's Snapshot */}
      {todayStats && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-gradient-to-r from-emerald-50/60 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-200/60 dark:border-emerald-800/40">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tracking-wide">LIVE</span>
              <span className="text-xs text-muted-foreground">Bugungi sotuv tahlili — {format(new Date(), 'dd.MM.yyyy HH:mm')}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-emerald-200/60 dark:divide-emerald-800/40">
            {/* Uzum */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-base">🟣</span>
                <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">Uzum</span>
              </div>
              <div className="flex gap-4 flex-wrap">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sotuvlar</p>
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{todayStats.uzum.orders}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Daromad</p>
                  <p className="text-sm font-semibold">{new Intl.NumberFormat('uz-UZ').format(Math.round(todayStats.uzum.revenue))} UZS</p>
                </div>
                {todayStats.uzum.returns > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Qaytarilgan</p>
                    <p className="text-sm font-semibold text-red-500">↩ {todayStats.uzum.returns}</p>
                  </div>
                )}
              </div>
            </div>
            {/* Yandex */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-base">🟡</span>
                <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">Yandex</span>
              </div>
              <div className="flex gap-4 flex-wrap">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sotuvlar</p>
                  <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{todayStats.yandex.orders}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Daromad</p>
                  <p className="text-sm font-semibold">{new Intl.NumberFormat('uz-UZ').format(Math.round(todayStats.yandex.revenue))} UZS</p>
                </div>
                {todayStats.yandex.returns > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Qaytarilgan</p>
                    <p className="text-sm font-semibold text-red-500">↩ {todayStats.yandex.returns}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats — KPI Cards with period label */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Period date badge shown on top of each card group */}
        <div className="col-span-2 md:col-span-4 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Davr ko'rsatkichlari</span>
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-xs text-muted-foreground bg-muted/40 border border-border/50 rounded-lg px-2.5 py-1 font-medium">
            📅 {periodLabel}
          </span>
        </div>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400 to-green-500" />
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('mpa_total_revenue')}</p>
                <p className="text-2xl font-bold">{formatCurrency(netRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cfg.label} • {shortLabel}</p>
              </div>
              <DollarSign className="h-8 w-8 text-emerald-500 opacity-70" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-400 to-blue-600" />
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('mpa_total_orders')}</p>
                <p className="text-2xl font-bold">{analytics.totalOrders}</p>
                <div className="flex gap-2 text-xs mt-0.5">
                  <span className="text-green-600">{analytics.completedOrders} ✓</span>
                  <span className="text-yellow-600">{analytics.pendingOrders} ⏳</span>
                </div>
              </div>
              <ShoppingCart className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-purple-400 to-purple-600" />
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('mpa_active_listings')}</p>
                <p className="text-2xl font-bold">{analytics.activeListings}</p>
                <div className="flex gap-2 text-xs mt-0.5">
                  <span className="text-yellow-600">{analytics.lowStockListings} {t('mpa_low')}</span>
                  <span className="text-red-600">{analytics.outOfStockListings} {t('mpa_ended')}</span>
                </div>
              </div>
              <Package className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-400 to-red-500" />
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Komissiya</p>
                <p className="text-2xl font-bold">{formatCurrency(analytics.totalCommission)}</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {analytics.totalRevenue > 0
                    ? (() => {
                      const comm = analytics.totalCommission;
                      if (comm > analytics.totalRevenue * 0.45) {
                        return `${(20).toFixed(1)}% daromaddan (taxminiy)*`;
                      }
                      return `${((comm / analytics.totalRevenue) * 100).toFixed(1)}% daromaddan`;
                    })()
                    : '0% daromaddan'}
                </p>
              </div>
              <Receipt className="h-8 w-8 text-orange-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Store Mini Cards (shown when uzum or yandex tab is selected) */}
      {platformTab !== 'all' && platformStores.length > 0 && (
        <div>
          <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${cfg.color}`}>
            <Store className="h-4 w-4" />
            {cfg.label} do'konlari bo'yicha daromad
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {platformStores.map(store => {
              const rev = baseStoreRevenue[store.id] || 0;
              const orders = baseStoreOrders[store.id] || 0;
              const totalRev = platformStores.reduce((s, st) => s + (baseStoreRevenue[st.id] || 0), 0);
              const pct = totalRev > 0 ? ((rev / totalRev) * 100).toFixed(0) : '0';
              const isSelected = selectedStoreId === store.id;
              return (
                <Card
                  key={store.id}
                  interactive
                  onClick={() => setSelectedStoreId(isSelected ? null : store.id)}
                  className={`relative overflow-hidden cursor-pointer transition-all ${isSelected
                    ? `ring-2 ${platformTab === 'uzum' ? 'ring-purple-500' : 'ring-yellow-500'}`
                    : selectedStoreId && !isSelected
                      ? 'opacity-50'
                      : ''
                    }`}
                >
                  <CardContent className="pt-3 pb-3">
                    <p className="font-medium text-sm line-clamp-1 mb-1">{store.name}</p>
                    <p className={`text-base font-bold ${cfg.color}`}>{formatCurrency(rev)}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">{orders} buyurtma</p>
                      <Badge variant="outline" className="text-xs px-1.5 py-0">{pct}%</Badge>
                    </div>
                    {/* mini progress bar */}
                    <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${platformTab === 'uzum' ? 'bg-purple-500' : 'bg-yellow-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <LineChart className="h-4 w-4" />
            {t('mpa_tab_sales')}
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            {t('mpa_tab_products')}
          </TabsTrigger>
          <TabsTrigger value="finance" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('mpa_tab_finance')}
          </TabsTrigger>
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6">
          {(() => {
            const platformDonutData = [
              { name: 'Uzum', value: platformStores.filter(s => s.platform === 'uzum').reduce((acc, s) => acc + (baseStoreRevenue[s.id] || 0), 0), fill: '#a855f7' },
              { name: 'Yandex', value: platformStores.filter(s => s.platform === 'yandex').reduce((acc, s) => acc + (baseStoreRevenue[s.id] || 0), 0), fill: '#eab308' },
            ].filter(d => d.value > 0);

            const hasAnyRevenue = platformDonutData.length > 0;
            // Fallback to listings count if no revenue
            const fallbackDonutData = [
              { name: 'Uzum', value: uzumStores.length, fill: '#a855f7' },
              { name: 'Yandex', value: yandexStores.length, fill: '#eab308' },
            ];
            const finalDonutData = hasAnyRevenue ? platformDonutData : fallbackDonutData;

            const orderStatusData = [
              { name: 'Yetkazilgan', value: analytics.completedOrders, fill: '#10b981' },
              { name: 'Kutilmoqda', value: analytics.pendingOrders, fill: '#f59e0b' },
              { name: 'Bekor qilingan', value: analytics.cancelledOrders, fill: '#ef4444' },
              { name: 'Qaytarilgan', value: analytics.returnedOrders, fill: '#f97316' },
            ].filter(d => d.value > 0);

            // Pad trend data with a flat line if empty so the chart still renders beautifully
            let paddedTrendData = [...trendData];
            if (paddedTrendData.length === 0) {
              for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                paddedTrendData.push({ date: format(d, 'MM-dd'), revenue: 0, orders: 0 });
              }
            }

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. PROPORTION OF TYPE (Uzum vs Yandex) */}
                <Card className="border-border/60 shadow-md bg-gradient-to-br from-card to-muted/20 overflow-hidden">
                  <CardHeader className="pb-2 border-b border-border/30">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm font-bold tracking-wider uppercase flex items-center gap-2 text-muted-foreground">
                        <PieChart className="h-4 w-4" /> Platforma taqsimoti
                      </CardTitle>
                      {/* Compact period selector */}
                      <div className="flex items-center gap-1">
                        {(['today', '7d', '30d', '90d'] as PeriodPreset[]).map((preset) => {
                          const label = preset === 'today' ? 'Bugun' : preset === '7d' ? '7k' : preset === '30d' ? '30k' : '90k';
                          return (
                            <button
                              key={preset}
                              onClick={() => { setPeriodPreset(preset); setShowCustomPicker(false); }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                periodPreset === preset && !showCustomPicker
                                  ? 'bg-foreground text-background border-foreground shadow-sm'
                                  : 'border-border/60 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground bg-muted/30'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { setShowCustomPicker(v => !v); if (!showCustomPicker) setPeriodPreset('custom'); }}
                          title="Boshqa sana"
                          className={`p-1.5 rounded-lg border transition-all ${
                            periodPreset === 'custom'
                              ? 'bg-foreground text-background border-foreground shadow-sm'
                              : 'border-border/60 text-muted-foreground hover:border-muted-foreground/60 bg-muted/30'
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Active period label under header */}
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-medium">
                      📅 {periodLabel}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6 relative flex flex-col items-center justify-center min-h-[280px]">
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-3xl font-black text-foreground">{hasAnyRevenue ? formatCurrency(analytics.totalRevenue).split(' ')[0] : (uzumStores.length + yandexStores.length)}</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-1">
                          {hasAnyRevenue ? 'UZS JAMI' : 'DO\'KONLAR'}
                        </p>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                      <RechartsPieChart>
                        <Pie
                          data={finalDonutData}
                          cx="50%" cy="50%"
                          innerRadius={80} outerRadius={105}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                          cornerRadius={8}
                        >
                          {finalDonutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => hasAnyRevenue ? [formatCurrency(value), ''] : [`${value} do'kon`, '']}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="flex gap-6 mt-2">
                      {finalDonutData.map(d => (
                         <div key={d.name} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: d.fill}}></div>
                            <span className="text-sm font-medium">{d.name}</span>
                         </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* 2. TOP 5 STORES */}
                <Card className="border-border/60 shadow-md bg-gradient-to-br from-card to-muted/20 overflow-hidden">
                  <CardHeader className="pb-2 border-b border-border/30">
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-bold tracking-wider uppercase flex items-center gap-2 text-muted-foreground">
                        <Target className="h-4 w-4" /> Top 5 Do'konlar
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        {(['today', '7d', '30d', '90d'] as PeriodPreset[]).map((preset) => {
                          const label = preset === 'today' ? 'Bugun' : preset === '7d' ? '7k' : preset === '30d' ? '30k' : '90k';
                          return (
                            <button
                              key={preset}
                              onClick={() => { setPeriodPreset(preset); setShowCustomPicker(false); }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                periodPreset === preset && !showCustomPicker
                                  ? 'bg-foreground text-background border-foreground shadow-sm'
                                  : 'border-border/60 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground bg-muted/30'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { setShowCustomPicker(v => !v); if (!showCustomPicker) setPeriodPreset('custom'); }}
                          title="Boshqa sana"
                          className={`p-1.5 rounded-lg border transition-all ${
                            periodPreset === 'custom'
                              ? 'bg-foreground text-background border-foreground shadow-sm'
                              : 'border-border/60 text-muted-foreground hover:border-muted-foreground/60 bg-muted/30'
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-medium">
                      📅 {periodLabel}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {storeChartData.length === 0 ? (
                       <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
                          <Store className="h-8 w-8 mb-2 opacity-20" />
                          <p className="text-sm">Hozircha ma'lumot yo'q</p>
                       </div>
                    ) : (
                      <div className="space-y-5 h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                        {storeChartData.slice(0, 5).map((store, index) => {
                          const maxVal = storeChartData[0].value || 1;
                          const pct = (store.value / maxVal) * 100;
                          return (
                            <div key={store.storeId} className="group">
                              <div className="flex justify-between items-end mb-1.5">
                                <div className="flex items-center gap-3">
                                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : index === 1 ? 'bg-slate-300/20 text-slate-500 border border-slate-300/50' : index === 2 ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-muted text-muted-foreground border border-border/50'}`}>
                                    {index + 1}
                                  </div>
                                  <span className="text-sm font-semibold text-foreground/90">{store.name}</span>
                                </div>
                                <span className="text-sm font-bold tracking-tight">{formatCurrency(store.value)}</span>
                              </div>
                              <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-1000 ease-out"
                                  style={{ width: `${Math.max(pct, 1)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 3. TREND ANALYSIS */}
                <Card className="border-border/60 shadow-md bg-gradient-to-br from-card to-muted/20 overflow-hidden lg:col-span-2">
                  <CardHeader className="pb-2 border-b border-border/30">
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-bold tracking-wider uppercase flex items-center gap-2 text-muted-foreground">
                        <LineChart className="h-4 w-4" /> Daromad tendensiyasi
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        {(['today', '7d', '30d', '90d'] as PeriodPreset[]).map((preset) => {
                          const label = preset === 'today' ? 'Bugun' : preset === '7d' ? '7k' : preset === '30d' ? '30k' : '90k';
                          return (
                            <button
                              key={preset}
                              onClick={() => { setPeriodPreset(preset); setShowCustomPicker(false); }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                periodPreset === preset && !showCustomPicker
                                  ? 'bg-foreground text-background border-foreground shadow-sm'
                                  : 'border-border/60 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground bg-muted/30'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => { setShowCustomPicker(v => !v); if (!showCustomPicker) setPeriodPreset('custom'); }}
                          title="Boshqa sana"
                          className={`p-1.5 rounded-lg border transition-all ${
                            periodPreset === 'custom'
                              ? 'bg-foreground text-background border-foreground shadow-sm'
                              : 'border-border/60 text-muted-foreground hover:border-muted-foreground/60 bg-muted/30'
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </button>
                        <span className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border/60">
                          <div className="w-2.5 h-2.5 rounded-full bg-primary/80 shadow-sm" /> 
                          <span className="text-xs font-medium">Daromad</span>
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-medium">
                      📅 {periodLabel}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={paddedTrendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => value > 1000000 ? `${(value/1000000).toFixed(1)}M` : value}
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), 'Daromad']}
                          labelFormatter={(label) => `Sana: ${label}`}
                          contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(var(--primary))"
                          strokeWidth={3}
                          fill="url(#colorRevenue)"
                          activeDot={{ r: 6, strokeWidth: 0, fill: 'hsl(var(--primary))', className: "shadow-md" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* 4. PROPORTION OF WAREHOUSING / ORDERS */}
                <Card className="border-border/60 shadow-md bg-gradient-to-br from-card to-muted/20 overflow-hidden lg:col-span-2">
                  <CardHeader className="pb-2 border-b border-border/30">
                    <CardTitle className="text-sm font-bold tracking-wider uppercase flex items-center gap-2 text-muted-foreground">
                      <PieChart className="h-4 w-4" /> Buyurtmalar Holati Taxtasi
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 flex flex-col md:flex-row items-center justify-center gap-8 min-h-[280px]">
                    {orderStatusData.length === 0 ? (
                       <div className="flex flex-col items-center justify-center text-muted-foreground w-full">
                          <ShoppingCart className="h-10 w-10 mb-3 opacity-20" />
                          <p className="text-sm">Hozircha buyurtmalar yo'q</p>
                       </div>
                    ) : (
                      <>
                        <div className="relative w-full md:w-[45%] lg:w-[40%] flex justify-center">
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <p className="text-4xl font-black text-foreground">{analytics.totalOrders}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-1">
                                JAMI BUYURTMA
                              </p>
                            </div>
                          </div>
                          <ResponsiveContainer width="100%" height={260}>
                            <RechartsPieChart>
                              <Pie
                                data={orderStatusData}
                                cx="50%" cy="50%"
                                innerRadius={85} outerRadius={115}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                                cornerRadius={8}
                              >
                                {orderStatusData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                              </Pie>
                              <Tooltip 
                                formatter={(value: number) => [`${value} ta`, 'Soni']}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                              />
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="w-full md:w-[55%] lg:w-[60%] flex flex-col justify-center gap-4 py-4 pr-6">
                          {orderStatusData.map((d) => {
                            const pct = ((d.value / analytics.totalOrders) * 100).toFixed(1);
                            return (
                              <div key={d.name} className="flex items-center gap-4 group">
                                <div className="w-4 h-4 rounded-full shadow-sm flex-shrink-0" style={{backgroundColor: d.fill}} />
                                <div className="flex-1">
                                  <div className="flex justify-between items-end mb-1">
                                    <span className="text-sm font-bold text-foreground/80">{d.name}</span>
                                    <span className="text-sm font-bold bg-muted/50 px-2 py-0.5 rounded-md">{d.value}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all duration-1000 shadow-inner" style={{width: `${pct}%`, backgroundColor: d.fill}} />
                                    </div>
                                    <span className="text-xs font-semibold text-muted-foreground w-12 text-right tracking-tight">{pct}%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

              </div>
            );
          })()}
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Product Rank Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  {t('mpa_product_rank')}
                </CardTitle>
                <CardDescription>{t('mpa_rank_distribution')}</CardDescription>
              </CardHeader>
              <CardContent>
                {listingsLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={rankChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="name" type="category" className="text-xs" width={60} />
                      <Tooltip />
                      <Bar
                        dataKey="value"
                        name={t('mpa_chart_products')}
                        cursor="pointer"
                        onClick={(data: any) => {
                          const rankMap: Record<string, string> = { 'A-Rank': 'A', 'B-Rank': 'B', 'C-Rank': 'C', 'D-Rank': 'D' };
                          const rank = rankMap[data.name] || 'N';
                          navigate(`/crm/marketplace/listings?rank=${rank}`);
                        }}
                      >
                        {rankChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Products */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <TrendingUp className="h-5 w-5" />
                  {t('mpa_top_products_title')}
                </CardTitle>
                <CardDescription>{t('mpa_top_desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {listingsLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : topProducts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t('mpa_no_a_rank')}</p>
                ) : (
                  <div className="space-y-2">
                    {topProducts.map((product, index) => (
                      <div key={product.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-green-600">#{index + 1}</span>
                          <div>
                            <p className="font-medium text-sm line-clamp-1">{product.title || product.external_sku}</p>
                            <p className="text-xs text-muted-foreground">{(product.marketplace_stores as any)?.name}</p>
                          </div>
                        </div>
                        <Badge variant="default" className="bg-green-600">A</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Worst Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-5 w-5" />
                {t('mpa_attention_needed')}
              </CardTitle>
              <CardDescription>{t('mpa_attention_desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {listingsLoading ? (
                <Skeleton className="h-[100px] w-full" />
              ) : worstProducts.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{t('mpa_no_problems')}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {worstProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20">
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{product.title || product.external_sku}</p>
                        <div className="flex gap-2">
                          {product.product_rank === 'D' && <Badge variant="destructive">D-Rank</Badge>}
                          {product.stock === 0 && <Badge variant="outline" className="text-red-600">{t('mpa_out_of_stock')}</Badge>}
                        </div>
                      </div>
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Finance Tab */}
        <TabsContent value="finance" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-green-200 bg-green-50/50 dark:bg-green-900/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-100 dark:bg-green-800">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Yalpi daromad</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(analytics.totalRevenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-900/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-800">
                    <Receipt className="h-5 w-5 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Komissiya</p>
                    <p className="text-lg font-bold text-orange-600">-{formatCurrency(analytics.totalCommission)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-900/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-800">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Sof daromad</p>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(netRevenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-900/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-800">
                    <Percent className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Bajarilish %</p>
                    <p className="text-lg font-bold text-purple-600">
                      {analytics.totalOrders > 0
                        ? ((analytics.completedOrders / analytics.totalOrders) * 100).toFixed(1) + '%'
                        : '0%'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('mpa_financial_summary')}</CardTitle>
              <CardDescription>
                {cfg.label} • {periodLabel}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span>{t('mpa_total_sales')}</span>
                  <span className="font-bold">{analytics.totalOrders}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span>{t('mpa_successful')}</span>
                  <span className="font-bold text-green-600">{analytics.completedOrders}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span>{t('mpa_cancelled')}</span>
                  <span className="font-bold text-red-600">{analytics.cancelledOrders}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span>Qaytarilgan</span>
                  <span className="font-bold text-orange-600">{analytics.returnedOrders}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <span>{t('mpa_waiting')}</span>
                  <span className="font-bold text-yellow-600">{analytics.pendingOrders}</span>
                </div>
                <div className="border-t pt-3 space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <span className="font-medium">Yalpi daromad</span>
                    <span className="font-bold text-green-600">{formatCurrency(analytics.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                    <span className="font-medium">Komissiya</span>
                    <span className="font-bold text-orange-600">-{formatCurrency(analytics.totalCommission)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <span className="font-medium">Sof daromad</span>
                    <span className="font-bold text-blue-600">{formatCurrency(netRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="font-medium">O'rtacha buyurtma (delivered)</span>
                    <span className="font-bold">
                      {analytics.completedOrders > 0
                        ? formatCurrency(analytics.totalRevenue / analytics.completedOrders)
                        : '0 UZS'}
                    </span>
                  </div>
                </div>

                {/* Per-store breakdown in finance tab */}
                {storeChartData.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-sm font-semibold mb-2">Do'konlar bo'yicha daromad</p>
                    <div className="space-y-2">
                      {storeChartData.map((store, index) => (
                        <div key={store.storeId} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-sm truncate max-w-[160px]">{store.name}</span>
                          </div>
                          <span className="text-sm font-semibold">{formatCurrency(store.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
