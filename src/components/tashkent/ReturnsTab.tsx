import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RotateCcw, Trash2, ChevronDown, ChevronUp, Package, Calendar, RefreshCw, Store, FileText, AlertTriangle, ScanLine } from 'lucide-react';
import { ReturnDocumentScanner } from './ReturnDocumentScanner';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface MarketplaceReturn {
  id: string;
  order_id: string | null;
  store_id: string | null;
  store_name: string | null;
  platform: string;
  external_order_id: string | null;
  nakladnoy_id: string | null;
  product_title: string;
  sku_title: string | null;
  image_url: string | null;
  quantity: number;
  amount: number | null;
  currency: string | null;
  return_reason: string | null;
  return_type: string | null;
  return_date: string | null;
  resolution: string;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface NakladnoyGroup {
  nakladnoy_id: string;
  store_name: string;
  platform: string;
  return_date: string;
  items: MarketplaceReturn[];
}

type Resolution = 'return_to_stock' | 'remove_from_stock';

const RESOLUTION_CONFIG: Record<Resolution, { label: string; icon: typeof RotateCcw; color: string; description: string }> = {
  return_to_stock: { label: 'Zaxiraga qaytarish', icon: RotateCcw, color: 'text-blue-500', description: 'Tovar ombor zaxirasiga qaytariladi' },
  remove_from_stock: { label: 'Zaxiradan chiqarish', icon: Trash2, color: 'text-destructive', description: 'Tovar zaxiradan chiqariladi' },
};

const RETURN_TYPE_CONFIG: Record<string, { label: string; color: string; badgeClass: string }> = {
  fbs_seller: { label: 'FBS qaytarish', color: 'text-blue-600', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800' },
  fbs_defect: { label: 'FBS brak', color: 'text-orange-600', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' },
  fbs_order: { label: 'FBS qaytgan', color: 'text-purple-600', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800' },
  fbo_return: { label: 'FBO qaytarish', color: 'text-indigo-600', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800' },
  fbo_defect: { label: 'FBO brak', color: 'text-red-600', badgeClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800' },
};

export function ReturnsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<{ id: string; resolution: Resolution; quantity: number; product_title: string } | null>(null);
  const [confirmBulkAction, setConfirmBulkAction] = useState<{ nakladnoy_id: string; resolution: Resolution; items: MarketplaceReturn[] } | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [removalNote, setRemovalNote] = useState('');
  const [bulkRemovalNote, setBulkRemovalNote] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDocScanner, setShowDocScanner] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Generate month options: 3 months ahead + 12 months back (to cover future dates like 2026-02)
  const monthOptions = useMemo(() => {
    const months: { value: string; label: string }[] = [
      { value: 'all', label: 'Barcha vaqt' },
    ];
    const now = new Date();
    const UZ_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
    for (let i = -3; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.getFullYear()} ${UZ_MONTHS[d.getMonth()]}`;
      months.push({ value, label });
    }
    return months;
  }, []);

  // Fetch returns — fbs_seller & fbs_defect only (actual seller returns from nakladnoy API)
  const { data: returns = [], isLoading, refetch } = useQuery({
    queryKey: ['marketplace_returns', monthFilter],
    queryFn: async () => {
      let query = supabase
        .from('marketplace_returns')
        .select('*')
        .order('return_date', { ascending: false });

      // Include all return types + manual scanned docs
      if (monthFilter !== 'all') {
        const [year, month] = monthFilter.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
        query = query.gte('return_date', startDate).lte('return_date', endDate);
      }

      const { data, error } = await query.limit(2000);
      if (error) throw error;

      // Enrich missing images from marketplace_listings
      const items = data as MarketplaceReturn[];
      const missingImageSkus = [...new Set(
        items.filter(i => !i.image_url && i.sku_title).map(i => i.sku_title!)
      )];

      if (missingImageSkus.length > 0) {
        const { data: listings } = await supabase
          .from('marketplace_listings')
          .select('external_sku, image_url')
          .in('external_sku', missingImageSkus)
          .not('image_url', 'is', null);

        if (listings && listings.length > 0) {
          const skuImageMap: Record<string, string> = {};
          for (const l of listings) {
            if (l.external_sku && l.image_url) skuImageMap[l.external_sku] = l.image_url;
          }
          for (const item of items) {
            if (!item.image_url && item.sku_title && skuImageMap[item.sku_title]) {
              item.image_url = skuImageMap[item.sku_title];
            }
          }
        }
      }

      return items;
    },
  });

  // Unique store info for filter — scoped to selected platform, with platform badges
  const storeInfo = useMemo(() => {
    let source = returns;
    if (platformFilter !== 'all') {
      source = source.filter(r => r.platform === platformFilter);
    }
    const map = new Map<string, Set<string>>();
    source.forEach(r => {
      if (!r.store_name) return;
      if (!map.has(r.store_name)) map.set(r.store_name, new Set());
      if (r.platform) map.get(r.store_name)!.add(r.platform);
    });
    return Array.from(map.entries())
      .map(([name, platforms]) => ({ name, platforms: Array.from(platforms) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [returns, platformFilter]);

  const filteredReturns = useMemo(() => {
    let result = returns;
    // Only marketplace items (not manual scanned docs) go through these filters
    result = result.filter(r => r.platform !== 'manual');
    if (platformFilter !== 'all') {
      result = result.filter(r => r.platform === platformFilter);
    }
    if (storeFilter !== 'all') {
      result = result.filter(r => r.store_name === storeFilter);
    }
    if (typeFilter !== 'all') {
      if (typeFilter === 'fbs') {
        result = result.filter(r => r.return_type && (r.return_type.startsWith('fbs') || r.return_type === 'fbs_order'));
      } else if (typeFilter === 'fbo') {
        // Hamma FBO tovarlar (Sog'lom va Brak)
        result = result.filter(r => r.return_type && (r.return_type.startsWith('fbo') || r.return_type === 'fbo_defect' || r.return_type === 'fbo_seller' || r.return_type === 'fbo_return'));
      } else if (typeFilter === 'fbo_defect_only') {
        // Faqat FBO Brak tovarlar
        result = result.filter(r => r.return_type === 'fbo_defect' || r.is_fbo_defect);
      }
    }
    return result;
  }, [returns, storeFilter, platformFilter, typeFilter]);

  const pendingReturns = useMemo(() => filteredReturns.filter(r => r.resolution === 'pending'), [filteredReturns]);
  const resolvedReturns = useMemo(() => filteredReturns.filter(r => r.resolution !== 'pending'), [filteredReturns]);

  // Manual scanned documents grouped by nakladnoy_id
  const scannedDocGroups = useMemo(() => {
    const manualItems = returns.filter(r => r.platform === 'manual');
    const map = new Map<string, { nakladnoy_id: string; store_name: string; return_date: string; items: MarketplaceReturn[] }>();
    manualItems.forEach(r => {
      const key = r.nakladnoy_id || r.id;
      if (!map.has(key)) {
        map.set(key, { nakladnoy_id: key, store_name: r.store_name || '', return_date: r.return_date || r.created_at, items: [] });
      }
      map.get(key)!.items.push(r);
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.return_date).getTime() - new Date(a.return_date).getTime());
  }, [returns]);

  // Group pending returns by nakladnoy_id
  const groupedPendingReturns = useMemo((): NakladnoyGroup[] => {
    const map = new Map<string, NakladnoyGroup>();
    pendingReturns.forEach(r => {
      const key = r.nakladnoy_id || r.id;
      if (!map.has(key)) {
        map.set(key, {
          nakladnoy_id: key,
          store_name: r.store_name || '',
          platform: r.platform,
          return_date: r.return_date || r.created_at,
          items: [],
        });
      }
      map.get(key)!.items.push(r);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.return_date).getTime() - new Date(a.return_date).getTime()
    );
  }, [pendingReturns]);

  // Group resolved returns by nakladnoy_id
  const groupedResolvedReturns = useMemo((): NakladnoyGroup[] => {
    const map = new Map<string, NakladnoyGroup>();
    resolvedReturns.forEach(r => {
      const key = r.nakladnoy_id || r.id;
      if (!map.has(key)) {
        map.set(key, {
          nakladnoy_id: key,
          store_name: r.store_name || '',
          platform: r.platform,
          return_date: r.return_date || r.created_at,
          items: [],
        });
      }
      map.get(key)!.items.push(r);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.return_date).getTime() - new Date(a.return_date).getTime()
    );
  }, [resolvedReturns]);

  const [isSyncingYandex, setIsSyncingYandex] = useState(false);

  // Sync from Uzum nakladnoy API and FBO defects
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // 1. Sync Uzum FBS returns (nakladnoy)
      const { data: fbsData, error: fbsError } = await supabase.functions.invoke('uzum-fbs-returns');
      if (fbsError) throw fbsError;
      const fbsResult = fbsData as { synced: number; stores: any[]; errors: string[] };

      // 2. Sync FBO Defects
      const { data: stores, error: storesError } = await supabase
        .from('marketplace_stores')
        .select('id, name')
        .eq('platform', 'uzum')
        .eq('is_active', true);

      if (storesError) throw storesError;

      let fboDefectsSynced = 0;
      for (const store of stores || []) {
        const { data: fboData, error: fboError } = await supabase.functions.invoke('uzum-finance', {
          body: { store_id: store.id, action: 'fbo_summary' }
        });

        if (fboError) continue;

        const results = fboData?.result || fboData;
        const potentialReturns = results?.returns || [];

        // ALL Uzum FBO returns should be processed
        const uzumFboReturns = potentialReturns;

        if (uzumFboReturns.length > 0) {
          console.log(`[ReturnsTab] Syncing ${uzumFboReturns.length} Uzum FBO returns/defects for store ${store.name}`);
          const fboRows = uzumFboReturns.map((ret: any) => {
            const stableId = ret.id || ret.returnId || ret.productId || ret.skuId || `rnd-${Math.random().toString(36).substring(7)}`;
            const externalId = `uzum-fbo-return-${stableId}`;

            const status = (ret.status || '').toUpperCase();
            const type = (ret.type || '').toUpperCase();
            const isDefect = ret.is_fbo_defect ||
              status === 'DEFECTED' || status === 'DEFECT' || status === 'REJECTED' ||
              status === 'BRAK' || status === 'READY_FOR_PICKUP' ||
              type === 'DEFECT' || type === 'BRAK';

            return {
              external_order_id: externalId,
              store_id: store.id,
              store_name: store.name,
              platform: 'uzum',
              product_title: ret.stock?.title || ret.productTitle || ret.title || (isDefect ? 'Uzum FBO Brak' : 'Uzum FBO Qaytarish'),
              sku_title: ret.skuTitle || ret.sku || ret.type || '',
              quantity: ret.quantity || 1,
              return_type: isDefect ? 'fbo_defect' : 'fbo_return',
              return_date: ret.dateCreated || ret.createdAt ? new Date(ret.dateCreated || ret.createdAt).toISOString() : new Date().toISOString(),
              resolution: 'pending',
              image_url: ret.stock?.image || ret.imageUrl || ret.image || null
            };
          });

          const { error: upsertErr } = await supabase
            .from('marketplace_returns')
            .upsert(fboRows, { onConflict: 'external_order_id,store_id' });

          if (upsertErr) {
            console.error('[uzum-returns] Upsert error:', upsertErr.message);
          } else {
            fboDefectsSynced += uzumFboReturns.length;
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['marketplace_returns'] });
      await refetch();

      const totalSynced = fbsResult.synced + fboDefectsSynced;
      if (totalSynced > 0) {
        toast.success(`${fbsResult.synced} ta FBS va ${fboDefectsSynced} ta FBO brak tovar qo'shildi`);
      } else {
        toast.info('Yangi vozvratlar topilmadi (FBS/FBO)');
      }

      if (fbsResult.errors?.length > 0) {
        toast.warning(`${fbsResult.errors.length} ta do'kon xatoligi bor`);
      }
    } catch (err: any) {
      toast.error('Vozvratlarni yuklashda xatolik: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync Yandex returns — all 4 Yandex stores
  const handleSyncYandex = async () => {
    setIsSyncingYandex(true);
    try {
      const { data: stores, error: storesError } = await supabase
        .from('marketplace_stores')
        .select('id, name')
        .eq('platform', 'yandex')
        .eq('is_active', true);
      if (storesError) throw storesError;
      if (!stores || stores.length === 0) {
        toast.info('Aktiv Yandex do\'konlari topilmadi');
        return;
      }

      let totalSynced = 0;
      let totalFboDefects = 0;
      let totalErrors = 0;
      for (const store of stores) {
        try {
          // 1. Sync Yandex FBS returns
          const { data, error } = await supabase.functions.invoke('yandex-returns', {
            body: { store_id: store.id, days: 60 },
          });
          if (error) { totalErrors++; }
          else { totalSynced += (data as any)?.returns_count || 0; }

          // 2. Sync Yandex FBO returns (experimental using yandex-finance or stocks if available)
          // Since yandex-returns usually covers all, let's explicitly look for defects if possible.
          // For now, let's assume yandex-returns might miss FBO defects and try fetching stocks with status
          const { data: stocksData } = await supabase.functions.invoke('yandex-stocks', {
            body: { store_id: store.id }
          });

          const defectedStocks: any[] = [];
          (stocksData?.stocks || []).forEach((s: any) => {
            if (s.stocks && Array.isArray(s.stocks)) {
              // Iterate over stock types (FIT, DEFECT, etc.)
              s.stocks.forEach((st: any) => {
                const type = (st.type || '').toUpperCase();
                if (type === 'DEFECT' || type === 'EXPIRED' || type === 'QUARANTINE' || type === 'REJECTED') {
                  defectedStocks.push({
                    ...s,
                    defectType: type,
                    defectQuantity: st.count || 1
                  });
                }
              });
            } else if (s.type === 'DEFECT' || s.status === 'DEFECT' || s.status === 'REJECTED') {
              // Fallback for older or different structure
              defectedStocks.push({
                ...s,
                defectType: s.type || 'DEFECT',
                defectQuantity: s.quantity || 1
              });
            }
          });

          if (defectedStocks.length > 0) {
            console.log(`[ReturnsTab] Syncing ${defectedStocks.length} Yandex FBO defects for store ${store.name}`);

            // Fetch fallback images from listings
            const offerIds = defectedStocks.map(s => s.offerId).filter(Boolean);
            const { data: listings } = await supabase
              .from('marketplace_listings')
              .select('external_sku, image_url')
              .eq('store_id', store.id)
              .in('external_sku', offerIds);

            const imageMap: Record<string, string> = {};
            (listings || []).forEach(l => {
              if (l.external_sku && l.image_url) imageMap[l.external_sku] = l.image_url;
            });

            const fboRows = defectedStocks.map((stock: any) => {
              const stableId = stock.offerId || stock.skuId || stock.id || `rnd-${Math.random().toString(36).substring(7)}`;
              const externalId = `yandex-fbo-defect-${stableId}-${stock.defectType || 'BRAK'}`;
              return {
                external_order_id: externalId,
                store_id: store.id,
                store_name: store.name,
                platform: 'yandex',
                product_title: stock.name || stock.title || stock.productTitle || 'Yandex Brak',
                sku_title: stock.offerId || stock.skuId || stock.sku || '',
                quantity: stock.defectQuantity || 1,
                return_type: 'fbo_defect',
                return_date: new Date().toISOString(),
                resolution: 'pending',
                image_url: stock.imageUrl || stock.image || imageMap[stock.offerId] || null
              };
            });

            const { error: upsertErr } = await supabase
              .from('marketplace_returns')
              .upsert(fboRows, { onConflict: 'external_order_id,store_id' });

            if (upsertErr) {
              console.error('[yandex-stocks] Upsert error:', upsertErr.message);
              totalErrors++;
            } else {
              totalFboDefects += defectedStocks.length;
            }
          }
        } catch {
          totalErrors++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['marketplace_returns'] });
      refetch();

      if (totalSynced > 0 || totalFboDefects > 0) {
        toast.success(`Yandex: ${totalSynced} ta vozvrad va ${totalFboDefects} ta FBO brak sinxronlashtirildi`);
      } else {
        toast.info('Yangi Yandex vozvradlari topilmadi');
      }
      if (totalErrors > 0) {
        toast.warning(`${totalErrors} ta do'konda xatolik`);
      }
    } catch (err: any) {
      toast.error('Yandex vozvradlarini yuklashda xatolik: ' + err.message);
    } finally {
      setIsSyncingYandex(false);
    }
  };

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution, note, quantity, product_title }: { id: string; resolution: Resolution; note?: string; quantity: number; product_title: string }) => {
      const { error } = await supabase
        .from('marketplace_returns')
        .update({
          resolution,
          resolution_note: note || null,
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;

      if (resolution === 'return_to_stock') {
        const { data: products } = await supabase
          .from('products')
          .select('id, tashkent_manual_stock')
          .ilike('name', `%${product_title.substring(0, 30)}%`)
          .limit(1);

        if (products && products.length > 0) {
          const product = products[0];
          const newStock = (product.tashkent_manual_stock || 0) + quantity;
          await supabase
            .from('products')
            .update({ tashkent_manual_stock: newStock })
            .eq('id', product.id);
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-returns'] });
      queryClient.invalidateQueries({ queryKey: ['tashkent-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['product-inventory-overview'] });
      toast.success(`${RESOLUTION_CONFIG[vars.resolution].label} - muvaffaqiyatli`);
      setConfirmAction(null);
      setRemovalNote('');
    },
    onError: () => toast.error('Xatolik yuz berdi'),
  });

  // Bulk resolve all items in a nakladnoy
  const bulkResolveMutation = useMutation({
    mutationFn: async ({ items, resolution, note }: { items: MarketplaceReturn[]; resolution: Resolution; note?: string }) => {
      const ids = items.map(i => i.id);
      const { error } = await supabase
        .from('marketplace_returns')
        .update({
          resolution,
          resolution_note: note || null,
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (error) throw error;

      if (resolution === 'return_to_stock') {
        for (const item of items) {
          const { data: products } = await supabase
            .from('products')
            .select('id, tashkent_manual_stock')
            .ilike('name', `%${item.product_title.substring(0, 30)}%`)
            .limit(1);
          if (products && products.length > 0) {
            const product = products[0];
            const newStock = (product.tashkent_manual_stock || 0) + item.quantity;
            await supabase
              .from('products')
              .update({ tashkent_manual_stock: newStock })
              .eq('id', product.id);
          }
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-returns'] });
      queryClient.invalidateQueries({ queryKey: ['tashkent-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['product-inventory-overview'] });
      toast.success(`${vars.items.length} ta tovar — ${RESOLUTION_CONFIG[vars.resolution].label}`);
      setConfirmBulkAction(null);
      setBulkRemovalNote('');
    },
    onError: () => toast.error('Xatolik yuz berdi'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
      </div>
    );
  }

  const isRemoval = confirmAction?.resolution === 'remove_from_stock';
  const isBulkRemoval = confirmBulkAction?.resolution === 'remove_from_stock';

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSync}
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Yuklanmoqda...' : 'Uzum nakladnoylarini yuklash'}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncYandex}
          disabled={isSyncingYandex}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', isSyncingYandex && 'animate-spin')} />
          {isSyncingYandex ? 'Yandex yuklanmoqda...' : 'Yandex vozvradlarini yuklash'}
        </Button>

        <Button
          size="sm"
          variant="default"
          onClick={() => setShowDocScanner(true)}
          className="gap-2 bg-primary/90 hover:bg-primary"
        >
          <ScanLine className="h-4 w-4" />
          Hujjat yuklash
        </Button>

        {/* Month filter */}
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-44 h-9">
            <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Oy tanlash" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Platform filter */}
        <Select value={platformFilter} onValueChange={(val) => { setPlatformFilter(val); setStoreFilter('all'); }}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Platforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha platformalar</SelectItem>
            <SelectItem value="uzum">🟠 Uzum</SelectItem>
            <SelectItem value="yandex">🟡 Yandex</SelectItem>
          </SelectContent>
        </Select>

        {/* Return Type filter */}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-9 font-medium">
            <SelectValue placeholder="Vozvrat turi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha turlar</SelectItem>
            <SelectItem value="fbs">📦 FBS qaytarishlar</SelectItem>
            <SelectItem value="fbo">📦 FBO (Sog'lom+Brak)</SelectItem>
            <SelectItem value="fbo_defect_only">🔴 Faqat FBO (Yaroqsiz)</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            FBS qaytarish
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            FBS qaytgan
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            FBS brak
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            FBO qaytarish
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            FBO brak
          </span>
        </div>
      </div>

      {/* ── Scanned Documents Section ── */}
      {scannedDocGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Skanerlangan hujjatlar
            <Badge variant="secondary">{scannedDocGroups.length} ta hujjat</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scannedDocGroups.map(group => (
              <DocumentGroupCard key={group.nakladnoy_id} group={group} onRefresh={() => refetch()} />
            ))}
          </div>
        </div>
      )}

      {/* Main Items List (Flat) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-destructive" />
            {showResolved ? 'Hal qilingan vozvratlar' : 'Kutilayotgan qaytarishlar'}
            <Badge variant={showResolved ? "secondary" : "destructive"}>
              {showResolved ? resolvedReturns.length : pendingReturns.length} ta tovar
            </Badge>
          </h2>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
            className="text-muted-foreground hover:text-foreground"
          >
            {showResolved ? 'Kutilayotganlarni ko\'rish' : 'Hal qilinganlarni ko\'rish'}
          </Button>
        </div>

        {(showResolved ? resolvedReturns : pendingReturns).length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">Tovarlar topilmadi</p>
            <p className="text-xs text-muted-foreground mt-1">Sinxronizatsiya tugmasini bosib ko'ring</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(showResolved ? resolvedReturns : pendingReturns).map(item => (
              <ReturnCard
                key={item.id}
                item={item}
                onAction={(res) => setConfirmAction({ id: item.id, resolution: res, quantity: item.quantity, product_title: item.product_title })}
                resolved={showResolved}
              />
            ))}
          </div>
        )}
      </div>

      {/* Single item removal reason dialog */}
      {confirmAction && isRemoval && (
        <Dialog open onOpenChange={(open) => { if (!open) { setConfirmAction(null); setRemovalNote(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zaxiradan chiqarish</DialogTitle>
              <DialogDescription>Chiqarish sababini kiriting (majburiy)</DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="Sabab..."
              value={removalNote}
              onChange={(e) => setRemovalNote(e.target.value)}
              className="min-h-[100px]"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setConfirmAction(null); setRemovalNote(''); }}>
                Bekor qilish
              </Button>
              <Button
                variant="destructive"
                disabled={!removalNote.trim() || resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ ...confirmAction, note: removalNote.trim() })}
              >
                {resolveMutation.isPending ? 'Yuklanmoqda...' : 'Tasdiqlash'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {confirmAction && !isRemoval && (
        <ConfirmDialog
          open={!!confirmAction}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={RESOLUTION_CONFIG[confirmAction.resolution].label}
          description={`${RESOLUTION_CONFIG[confirmAction.resolution].description} (${confirmAction.quantity} dona)`}
          confirmText="Tasdiqlash"
          onConfirm={() => resolveMutation.mutate(confirmAction)}
          isLoading={resolveMutation.isPending}
        />
      )}


      {/* Return Document Scanner Dialog */}
      <ReturnDocumentScanner
        open={showDocScanner}
        onOpenChange={setShowDocScanner}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['marketplace_returns'] });
          refetch();
        }}
      />

    </div>
  );
}



function ReturnCard({
  item,
  onAction,
  resolved,
}: {
  item: MarketplaceReturn;
  onAction?: (r: Resolution) => void;
  resolved?: boolean;
}) {
  const resolutionBadge = resolved && item.resolution !== 'pending'
    ? RESOLUTION_CONFIG[item.resolution as Resolution]
    : null;

  const returnTypeConf = item.return_type ? RETURN_TYPE_CONFIG[item.return_type] : null;
  const isDefect = item.return_type === 'fbo_defect' || item.return_type === 'fbs_defect';

  const formattedDate = (() => {
    try { return format(new Date(item.return_date || item.created_at), 'dd.MM.yyyy'); } catch { return ''; }
  })();

  return (
    <Card className={cn(
      "overflow-hidden flex flex-col",
      resolved && "opacity-75 grayscale-[0.3]",
      isDefect && "border-red-200 dark:border-red-900/40"
    )}>
      <div className="p-4 flex-1 space-y-3">
        {/* Top Info */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border",
              item.platform === 'yandex'
                ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                : "bg-orange-50 text-orange-700 border-orange-200"
            )}>
              {item.platform}
            </span>
            {item.nakladnoy_id && (
              <span className="text-[10px] text-muted-foreground font-mono">
                #{item.nakladnoy_id}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formattedDate}
          </span>
        </div>
        {item.image_url ? (
          <img
            src={item.image_url.startsWith('http') ? item.image_url : `https://images.uzum.uz/${item.image_url}`}
            alt={item.product_title}
            className="w-14 h-14 rounded-lg object-cover bg-muted flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className={cn("w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0", isDefect ? "bg-orange-50 dark:bg-orange-950/30" : "bg-muted")}>
            {isDefect
              ? <AlertTriangle className="h-5 w-5 text-orange-400" />
              : <Package className="h-5 w-5 text-muted-foreground" />
            }
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-foreground line-clamp-2">{item.product_title}</p>
          {item.sku_title && <p className="text-xs text-muted-foreground truncate">{item.sku_title}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {returnTypeConf && (
              <span className={cn("inline-flex text-xs font-medium px-1.5 py-0.5 rounded border", returnTypeConf.badgeClass)}>
                {returnTypeConf.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{item.quantity} dona</span>
            {item.amount && ((item.currency === 'RUB' && item.amount >= 1) || (item.currency !== 'RUB' && item.amount >= 1000)) && (
              <span className="text-xs font-medium text-foreground">{Number(item.amount).toLocaleString()} {item.currency || 'UZS'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Return reason */}
      {item.return_reason && (
        <p className={cn("text-xs rounded p-2", isDefect ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400" : "bg-muted/50 text-muted-foreground")}>
          {item.return_reason}
        </p>
      )}

      {/* Resolution badge (resolved) */}
      {resolved && resolutionBadge && (
        <div className="space-y-1">
          <Badge className={cn("text-xs", resolutionBadge.color)}>
            {resolutionBadge.label}
          </Badge>
          {item.resolution_note && (
            <p className="text-xs text-muted-foreground italic">Sabab: {item.resolution_note}</p>
          )}
        </div>
      )}

      {/* Action buttons (pending) */}
      {!resolved && onAction && (
        <div className="flex gap-2 mt-auto p-4 pt-0">
          <Button size="sm" variant="outline" className="flex-1 text-blue-500 border-blue-500/30 hover:bg-blue-500/10 text-xs" onClick={() => onAction('return_to_stock')}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Zaxiraga
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10 text-xs" onClick={() => onAction('remove_from_stock')}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Chiqarish
          </Button>
        </div>
      )}
    </Card>
  );
}

function DocumentGroupCard({
  group,
  onRefresh,
}: {
  group: { nakladnoy_id: string; store_name: string; return_date: string; items: MarketplaceReturn[] };
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  const goodItems    = group.items.filter(i => i.resolution === 'normal');
  const fixableItems = group.items.filter(i => i.resolution === 'return_to_stock');
  const nonfixItems  = group.items.filter(i => i.resolution === 'remove_from_stock');

  const sumOf = (arr: MarketplaceReturn[]) =>
    arr.reduce((s, i) => s + (i.amount || 0), 0);

  const totalQty = (arr: MarketplaceReturn[]) =>
    arr.reduce((s, i) => s + i.quantity, 0);

  const formattedDate = (() => {
    try { return format(new Date(group.return_date), 'dd.MM.yyyy'); } catch { return ''; }
  })();

  const handleDelete = async () => {
    if (!confirm("Bu hujjatni o'chirmoqchimisiz?")) return;
    setDeleting(true);
    const ids = group.items.map(i => i.id);
    await supabase.from('marketplace_returns').delete().in('id', ids);
    queryClient.invalidateQueries({ queryKey: ['marketplace_returns'] });
    onRefresh();
    setDeleting(false);
  };

  const ResolutionRow = ({ label, color, items }: { label: string; color: string; items: MarketplaceReturn[] }) => (
    items.length === 0 ? null : (
      <>
        <tr>
          <td colSpan={5} className={`px-3 py-1.5 text-xs font-semibold ${color} bg-muted/50`}>{label}</td>
        </tr>
        {items.map((item, idx) => (
          <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 text-sm">
            <td className="px-3 py-2 text-muted-foreground text-xs">{idx + 1}</td>
            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.sku_title}</td>
            <td className="px-3 py-2 font-medium">{item.product_title}</td>
            <td className="px-3 py-2 text-right font-bold">{item.quantity}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{(item.amount || 0).toLocaleString()} UZS</td>
          </tr>
        ))}
      </>
    )
  );

  return (
    <>
      <Card className="overflow-hidden border-2 border-primary/10 hover:border-primary/25 transition-colors">
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-muted-foreground truncate">{group.nakladnoy_id}</p>
              <p className="font-semibold text-sm mt-0.5 truncate">{group.store_name}</p>
            </div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
              <Calendar className="h-3 w-3" />{formattedDate}
            </span>
          </div>

          {/* Quality breakdown */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 px-3 py-2">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">🟢 Sifatli tovar</span>
              <div className="text-right">
                <span className="text-xs font-bold text-emerald-700">{totalQty(goodItems)} dona</span>
                <span className="text-[10px] text-emerald-600 ml-2">{sumOf(goodItems).toLocaleString()} UZS</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 px-3 py-2">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">🔧 Brak: tuzatiladi</span>
              <div className="text-right">
                <span className="text-xs font-bold text-amber-700">{totalQty(fixableItems)} dona</span>
                <span className="text-[10px] text-amber-600 ml-2">{sumOf(fixableItems).toLocaleString()} UZS</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200/60 px-3 py-2">
              <span className="text-xs font-medium text-red-700 dark:text-red-400">❌ Brak: tuzatib bo'lmaydi</span>
              <div className="text-right">
                <span className="text-xs font-bold text-red-700">{totalQty(nonfixItems)} dona</span>
                <span className="text-[10px] text-red-600 ml-2">{sumOf(nonfixItems).toLocaleString()} UZS</span>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-xs text-muted-foreground">{group.items.length} turdagi tovar</span>
            <span className="text-sm font-bold">{sumOf(group.items).toLocaleString()} UZS</span>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setViewOpen(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              Hujjatni ko'rish
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-destructive hover:bg-destructive/10 gap-1"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "O'chirilmoqda..." : "O'chirish"}
            </Button>
          </div>
        </div>
      </Card>

      {/* View Document Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="!max-w-none w-[min(900px,92vw)] max-h-[85vh] flex flex-col overflow-hidden p-0">
          <div className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {group.nakladnoy_id}
              </DialogTitle>
              <DialogDescription>
                {group.store_name} · {formattedDate} · {group.items.length} turdagi tovar
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Document image */}
            {group.items[0]?.image_url ? (
              <a href={group.items[0].image_url} target="_blank" rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border hover:opacity-90 transition-opacity">
                <img
                  src={group.items[0].image_url}
                  alt="Skanerlangan hujjat"
                  className="w-full max-h-64 object-contain bg-gray-50"
                />
                <p className="text-center text-xs text-muted-foreground py-1.5 bg-muted/50 border-t">
                  🔍 To'liq ko'rish uchun bosing
                </p>
              </a>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm bg-muted/20">
                <p>📄 Hujjat rasmi mavjud emas</p>
                <p className="text-xs mt-1">Keyingi skanerda rasm saqlanadi</p>
              </div>
            )}

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200/60 p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">🟢 Sifatli</p>
                <p className="text-lg font-bold text-emerald-700">{totalQty(goodItems)} dona</p>
                <p className="text-xs text-emerald-600">{sumOf(goodItems).toLocaleString()} UZS</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200/60 p-3 text-center">
                <p className="text-xs text-amber-600 font-medium">🔧 Tuzatiladi</p>
                <p className="text-lg font-bold text-amber-700">{totalQty(fixableItems)} dona</p>
                <p className="text-xs text-amber-600">{sumOf(fixableItems).toLocaleString()} UZS</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200/60 p-3 text-center">
                <p className="text-xs text-red-600 font-medium">❌ Tuzatib bo'lmaydi</p>
                <p className="text-lg font-bold text-red-700">{totalQty(nonfixItems)} dona</p>
                <p className="text-xs text-red-600">{sumOf(nonfixItems).toLocaleString()} UZS</p>
              </div>
            </div>

            {/* Items table */}
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground text-xs">
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2 w-[18%]">SKU</th>
                    <th className="text-left px-3 py-2">Nomi</th>
                    <th className="text-right px-3 py-2 w-16">Soni</th>
                    <th className="text-right px-3 py-2 w-[18%]">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  <ResolutionRow label="🟢 Sifatli tovar" color="text-emerald-700" items={goodItems} />
                  <ResolutionRow label="🔧 Brak: tuzatiladi" color="text-amber-700" items={fixableItems} />
                  <ResolutionRow label="❌ Brak: tuzatib bo'lmaydi" color="text-red-700" items={nonfixItems} />
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/50 font-bold">
                    <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground text-sm">Jami:</td>
                    <td className="px-3 py-2 text-right">{totalQty(group.items)} dona</td>
                    <td className="px-3 py-2 text-right text-primary">{sumOf(group.items).toLocaleString()} UZS</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


