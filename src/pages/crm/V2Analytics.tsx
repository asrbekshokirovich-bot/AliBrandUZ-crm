import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  BarChart3,
  Filter,
  RefreshCw,
  ShoppingCart,
  Percent,
  Calendar,
  Store,
  ChevronDown,
  Info
} from "lucide-react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { uz } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip as TitleTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Design Palette
const COLORS = {
  revenue: "#8b5cf6", // Purple
  profit: "#10b981",  // Emerald
  loss: "#ef4444",    // Red
  accent: "#f59e0b",  // Amber
  muted: "#94a3b8"    // Slate
};

const CHART_COLORS = ["#8b5cf6", "#10b981", "#f59e0b", "#06b6d4", "#ec4899", "#f97316"];

export default function V2Analytics() {
  const { t } = useTranslation();
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [metricMode, setMetricMode] = useState<"realized" | "projected">("realized");
  const [period, setPeriod] = useState<string>("30");

  // Fetch Marketplaces for filter
  const { data: stores } = useQuery({
    queryKey: ['v2-stores-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v2_marketplaces')
        .select('id, shop_name, platform, tax_rate')
        .eq('is_active', true)
        .neq('external_shop_id', 'UNSET'); // Test do'konlarini olib tashlaymiz
      if (error) throw error;
      return data;
    }
  });

  // Main Analytics Data Fetching
  const { data: analytics, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['v2-analytics-data', platformFilter, selectedStoreId, metricMode, period],
    queryFn: async () => {
      const now = new Date();
      const startDate = startOfDay(subDays(now, parseInt(period)));
      
      // 1. Fetch Daily Trends (Direct from pre-aggregated table)
      let trendQuery = supabase
        .from('v2_daily_analytics')
        .select('*')
        .gte('report_date', startDate.toISOString())
        .order('report_date', { ascending: true });

      if (selectedStoreId !== "all") {
        trendQuery = trendQuery.eq('marketplace_id', selectedStoreId);
      }

      const { data: trendData, error: trendError } = await trendQuery;
      if (trendError) throw trendError;

      // 2. Fetch Aggregated Metrics from Unified Orders (For Precision)
      // Schema: v2_unified_orders uses 'gross_amount' (not 'total_amount')
      let metricsQuery = supabase
        .from('v2_unified_orders')
        .select('gross_amount, marketplace_commission, logistics_fee, storage_fee, product_cost, normalized_status, marketplace_id')
        .gte('ordered_at', startDate.toISOString());

      if (selectedStoreId !== "all") {
        metricsQuery = metricsQuery.eq('marketplace_id', selectedStoreId);
      } else if (platformFilter !== "all") {
        const platformStoreIds = stores?.filter(s => s.platform === platformFilter).map(s => s.id) || [];
        if (platformStoreIds.length > 0) {
          metricsQuery = metricsQuery.in('marketplace_id', platformStoreIds);
        }
      }

      const { data: orderData, error: orderError } = await metricsQuery;
      if (orderError) throw orderError;

      // Process Metrics locally for high-precision totals
      const targetStatuses = metricMode === 'realized' ? ['delivered'] : ['pending', 'shipped', 'delivered'];
      
      const filteredOrders = orderData.filter(o => targetStatuses.includes(o.normalized_status));
      const returnedOrders = orderData.filter(o => o.normalized_status === 'returned');

      // Use 'gross_amount' — the correct v2 schema column name
      const grossSales = filteredOrders.reduce((sum, o) => sum + (Number(o.gross_amount) || 0), 0);
      const logisticsCosts = filteredOrders.reduce((sum, o) => sum + (Number(o.logistics_fee) || 0), 0);
      const commissions = filteredOrders.reduce((sum, o) => sum + (Number(o.marketplace_commission) || 0), 0);
      const productCosts = filteredOrders.reduce((sum, o) => sum + (Number(o.product_cost) || 0), 0);
      
      // Zarar (Loss Recovery): faqat logistics_fee + commission — mahsulot narxi emas!
      const lossOnReturns = returnedOrders.reduce(
        (sum, o) => sum + (Number(o.logistics_fee) || 0) + (Number(o.marketplace_commission) || 0), 0
      );

      // Tax: margin (foyda) dan hisoblaymiz, gross-dan emas
      const grossMargin = grossSales - commissions - logisticsCosts - productCosts;
      const storeRate = stores?.find(s => s.id === selectedStoreId)?.tax_rate;
      const taxRate = storeRate !== undefined ? Number(storeRate) : 0.12;
      const estimatedTax = grossMargin > 0 ? grossMargin * taxRate : 0;
      const netProfit = grossMargin - estimatedTax;

      return {
        grossSales,
        netProfit,
        orderCount: filteredOrders.length,
        lossOnReturns,
        avgTicket: filteredOrders.length > 0 ? grossSales / filteredOrders.length : 0,
        trends: trendData.map(d => ({
          date: format(new Date(d.report_date), 'dd MMM', { locale: uz }),
          // v2_daily_analytics: total_sales_volume va total_net_profit
          revenue: Number(d.total_sales_volume) || 0,
          profit: Number(d.total_net_profit) || 0
        })),
        distribution: stores?.map(s => ({
          name: s.shop_name,
          // gross_amount — to'g'ri ustun nomi
          value: orderData.filter(o => o.marketplace_id === s.id).reduce((sum, o) => sum + (Number(o.gross_amount) || 0), 0)
        })).filter(d => d.value > 0) || []
      };
    },
    enabled: !!stores 
  });

  return (
    <div className="p-4 md:p-8 space-y-8 bg-[#fdfdfd] min-h-screen">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">MP Tahlilchi</h1>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">v2.0 Beta</Badge>
          </div>
          <p className="text-slate-500 font-medium">AliBrand.uz Yuqori aniqlikdagi analitika tizimi</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Davr" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Oxirgi 7 kun</SelectItem>
              <SelectItem value="30">Oxirgi 30 kun</SelectItem>
              <SelectItem value="90">Oxirgi 90 kun</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setSelectedStoreId('all'); }}>
            <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0">
              <div className="flex items-center">
                <Store className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Platforma" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha MP</SelectItem>
              <SelectItem value="uzum">Uzum Market</SelectItem>
              <SelectItem value="yandex">Yandex Market</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-[160px] border-none shadow-none focus:ring-0">
              <div className="flex items-center">
                <Package className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Do'kon" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha do'konlar</SelectItem>
              {stores?.filter(s => platformFilter === 'all' || s.platform === platformFilter).map(s => (
                <SelectItem key={s.id} value={s.id}>{s.shop_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => refetch()} 
            className={isRefetching ? "animate-spin" : ""}
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </Button>
        </div>
      </div>

      <div className="flex justify-center md:justify-start">
        <Tabs value={metricMode} onValueChange={(v: any) => setMetricMode(v)} className="w-full max-w-[400px]">
          <TabsList className="grid w-full grid-cols-2 p-1 bg-slate-100 rounded-xl">
            <TabsTrigger value="realized" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <DollarSign className="w-4 h-4 mr-2" />
              Haqiqiy Foyda
            </TabsTrigger>
            <TabsTrigger value="projected" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <TrendingUp className="w-4 h-4 mr-2" />
              Kutilayotgan
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Yalpi Savdo" 
          value={analytics?.grossSales} 
          icon={<DollarSign className="text-violet-600" />} 
          loading={isLoading}
          tooltip="Tanlangan davr ichidagi jami sotuvlar summasi (QQS bilan)"
        />
        <MetricCard 
          title="Sof Foyda" 
          value={analytics?.netProfit} 
          icon={<TrendingUp className="text-emerald-600" />} 
          loading={isLoading}
          accent={true}
          tooltip="Barcha komissiya, logistika, tan-narx va soliqlardan keyingi sof qoldiq"
        />
        <MetricCard 
          title="Buyurtmalar" 
          value={analytics?.orderCount} 
          icon={<ShoppingCart className="text-amber-600" />} 
          isCurrency={false}
          loading={isLoading}
        />
        <MetricCard 
          title="Zarar (Vozvrat)" 
          value={analytics?.lossOnReturns} 
          icon={<AlertTriangle className="text-rose-600" />} 
          loading={isLoading}
          negative={true}
          tooltip="Qaytib kelgan tovarlar uchun ketgan logistika va xizmat haqi zarari"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white">
          <CardHeader className="p-8 border-b border-slate-50">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  Savdo va Foyda Dinamikasi
                </CardTitle>
                <CardDescription>Kunlik ko'rsatkichlar trendi</CardDescription>
              </div>
              <Badge variant="secondary" className="font-mono uppercase text-[10px] tracking-widest">{metricMode}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8 h-[450px]">
            {isLoading ? (
              <div className="w-full h-full space-y-4">
                <Skeleton className="w-full h-full rounded-2xl" />
              </div>
            ) : analytics?.trends && analytics.trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics?.trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.revenue} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={COLORS.revenue} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.profit} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={COLORS.profit} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: COLORS.muted, fontSize: 12, fontWeight: 500}} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: COLORS.muted, fontSize: 12}} 
                    tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip 
                    content={<CustomTooltip />}
                    cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke={COLORS.revenue} 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorRev)" 
                    activeDot={{ r: 6, strokeWidth: 0, fill: COLORS.revenue }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stroke={COLORS.profit} 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorProf)" 
                    activeDot={{ r: 6, strokeWidth: 0, fill: COLORS.profit }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ZeroState />
            )}
          </CardContent>
        </Card>

        <div className="space-y-8">
          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl bg-white p-2">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-lg font-bold">Do'konlar Ulushi</CardTitle>
              <CardDescription>Daromad bo'yicha taqsimot</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
               {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <Skeleton className="h-32 w-32 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
               ) : analytics?.distribution && analytics.distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics?.distribution}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {analytics?.distribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip content={<SimpleTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
               ) : (
                 <ZeroState compact />
               )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
             <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                   <Store className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                   <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Faol Do'konlar</p>
                   <h4 className="text-xl font-bold">{stores?.length || 0} ta do'kon</h4>
                </div>
             </div>
             <div className="space-y-2">
               {stores?.slice(0, 4).map(s => (
                 <div key={s.id} className="flex items-center justify-between">
                   <span className="text-slate-300 text-xs truncate max-w-[140px]">{s.shop_name}</span>
                   <Badge variant="outline" className={`text-[10px] border-none ${
                     s.platform === 'uzum' ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'
                   }`}>{s.platform}</Badge>
                 </div>
               ))}
               {(stores?.length || 0) > 4 && (
                 <p className="text-slate-500 text-xs">+{(stores?.length || 0) - 4} ta boshqa...</p>
               )}
             </div>
             <div className="mt-6 flex items-center justify-between text-xs font-mono text-slate-500">
                <span>V2 SYSTEM: LIVE</span>
                <span>GMT+5 ✓</span>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, loading, isCurrency = true, accent, negative, tooltip }: any) {
  const formatValue = (val: number | undefined) => {
    if (val === undefined) return "0.00";
    return val.toLocaleString('uz-UZ', { 
      minimumFractionDigits: isCurrency ? 2 : 0, 
      maximumFractionDigits: isCurrency ? 2 : 0 
    });
  };

  return (
    <Card className={`group relative border-none shadow-lg shadow-slate-200/40 rounded-3xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
      accent ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white' : 'bg-white'
    }`}>
      <CardContent className="p-7">
        <div className="flex justify-between items-start mb-6">
          <div className={`p-4 rounded-2xl transition-colors ${
            accent ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-900 group-hover:bg-slate-100'
          }`}>
            {icon}
          </div>
          {tooltip && (
            <TooltipProvider>
              <TitleTooltip>
                <TooltipTrigger>
                  <Info className={`w-4 h-4 ${accent ? 'text-white/40' : 'text-slate-300'}`} />
                </TooltipTrigger>
                <TooltipContent className="bg-slate-900 text-white border-none p-3 rounded-xl max-w-[200px]">
                  <p className="text-xs font-medium">{tooltip}</p>
                </TooltipContent>
              </TitleTooltip>
            </TooltipProvider>
          )}
        </div>
        
        <div className="space-y-1">
          <p className={`text-sm font-bold uppercase tracking-widest ${accent ? 'text-white/60' : 'text-slate-400'}`}>
            {title}
          </p>
          {loading ? (
            <Skeleton className={`h-10 w-2/3 ${accent ? 'bg-white/10' : 'bg-slate-100'}`} />
          ) : (
            <h3 className={`text-2xl lg:text-3xl font-black ${negative ? 'text-rose-500' : ''}`}>
              {formatValue(value)} 
              {isCurrency && <span className={`text-base font-medium ml-2 ${accent ? 'text-white/50' : 'text-slate-400'}`}>sum</span>}
            </h3>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-50 min-w-[180px]">
        <p className="text-slate-900 font-bold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          {label}
        </p>
        <div className="space-y-2">
          <div className="flex justify-between items-center gap-4">
            <span className="text-slate-500 text-xs font-bold uppercase">Savdo:</span>
            <span className="text-indigo-600 font-extrabold">{payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-slate-500 text-xs font-bold uppercase">Foyda:</span>
            <span className="text-emerald-600 font-extrabold">{payload[1].value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function SimpleTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl text-xs font-bold shadow-xl">
        {payload[0].name}: {payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2 })} sum
      </div>
    );
  }
  return null;
}

function ZeroState({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 opacity-40 ${compact ? 'h-full' : 'h-[300px]'}`}>
      <div className="p-4 bg-slate-100 rounded-full">
         <Package className="w-8 h-8 text-slate-400" />
      </div>
      <p className="text-slate-500 text-sm font-medium">Bu muddat uchun ma'lumotlar yo'q</p>
    </div>
  );
}
