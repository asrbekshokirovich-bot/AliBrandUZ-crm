import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Edit, Trash2, Package, Layers, ShieldAlert, X } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductItemsView } from '@/components/crm/ProductItemsView';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import { Badge } from '@/components/ui/badge';
import { useUserRole } from '@/hooks/useUserRole';
import { ProductAdvancedFilters, ProductFilters, initialFilters } from '@/components/products/ProductAdvancedFilters';
import { ProductExportImport } from '@/components/products/ProductExportImport';
import { StockSyncButton } from '@/components/products/StockSyncButton';
import { MobileProductCard } from '@/components/products/MobileProductCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFinanceCurrency } from '@/contexts/FinanceCurrencyContext';

export default function Products() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { isAdmin, isOwner, isChiefManager, isChinaManager, isChinaStaff, isMarketplaceManager, isSupport, isLoading: roleLoading } = useUserRole();
  const { usdToUzs, cnyToUzs } = useFinanceCurrency();

  // Role-based access control
  // roleLoading paytida canAccess ni false qilmaslik — bu products ko'rinmasligi muammosiga olib keladi
  const canAccess = roleLoading ? true : (isAdmin || isOwner || isChiefManager || isMarketplaceManager || isSupport);
  const canEdit = isAdmin || isOwner || isChiefManager;

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [advancedFilters, setAdvancedFilters] = useState<ProductFilters>(initialFilters);
  const [open, setOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Xitoyda pending items bor mahsulot ID larini olish
  const { data: pendingItemsData } = useQuery({
    queryKey: ['pending-items-china'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_items')
        .select('product_id')
        .eq('status', 'pending')
        .eq('location', 'china');

      if (error) throw error;

      // product_id bo'yicha gruppalash va count qilish
      const counts: Record<string, number> = {};
      data?.forEach(item => {
        if (item.product_id) {
          counts[item.product_id] = (counts[item.product_id] || 0) + 1;
        }
      });
      return counts;
    },
    enabled: canAccess,
    placeholderData: (previousData) => previousData,
  });

  const pendingProductIds = Object.keys(pendingItemsData || {});

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', pendingProductIds.join(',')],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')
        .neq('status', 'archived')
        .order('updated_at', { ascending: false, nullsFirst: false });

      // Marketplace auto-yaratilgan mahsulotlarni chiqarib tashlash (pending items borlaridan tashqari)
      if (pendingProductIds.length > 0) {
        query = query.or(
          `source.neq.marketplace_auto,id.in.(${pendingProductIds.join(',')})`
        );
        query = query.or(
          `tashkent_manual_stock.is.null,tashkent_manual_stock.eq.0,id.in.(${pendingProductIds.join(',')})`
        );
      } else {
        query = query.neq('source', 'marketplace_auto');
        query = query.or('tashkent_manual_stock.is.null,tashkent_manual_stock.eq.0');
      }

      return await fetchAllRows(query);
    },
    enabled: canAccess,
    placeholderData: (previousData) => previousData, // keepPreviousData ning sodda analogi, ekranni o'chib ketishdan saqlaydi
  });

  // Real-time subscription for products and product_items
  useEffect(() => {
    const productsChannel = supabase
      .channel('products-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        () => {
          // NOTE: Removed immediate generic invalidation to prevent 
          // race conditions with pending-items-china which determines visibility. 
          // Form submissions safely handle deliberate UI invalidations.
        }
      )
      .subscribe();

    // product_items ham kuzatish - yangi items yaratilganda pending counts yangilanadi
    const itemsChannel = supabase
      .channel('product-items-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_items'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pending-items-china'] });
          // NOTE: DO NOT invalidate ['products'] here to avoid race conditions. 
          // Re-fetching pending-items-china updates pendingProductIds, 
          // which automatically triggers the products query to refetch due to its queryKey dependency.
        }
      )
      .subscribe();

    // product_variants kuzatish - Uzumda sotilganda stock kamayganda avtomatik yangilanadi
    const variantsChannel = supabase
      .channel('product-variants-stock-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'product_variants'
        },
        () => {
          // Variant stock o'zgarganda (masalan, sotilganda) produktlarni qayta yuklash
          queryClient.invalidateQueries({ queryKey: ['pending-items-china'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(variantsChannel);
    };
  }, [queryClient]);

  const { data: categories } = useQuery({
    queryKey: ['categories-hierarchy-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories_hierarchy')
        .select('*')
        .eq('is_active', true)
        .order('level', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const deleteProductById = async (product: any) => {
    // Agar mahsulotda Toshkent zaxirasi bo'lsa, uni arxivlamaymiz
    // Buning o'rniga faqat pending (Xitoydagi) itemlarni o'chiramiz
    if (product.tashkent_manual_stock > 0) {
      const { error: itemError } = await supabase
        .from('product_items')
        .delete()
        .eq('product_id', product.id)
        .eq('status', 'pending')
        .eq('location', 'china');

      if (itemError) throw itemError;
      return { type: 'canceled' };
    }

    // Soft delete — statusni 'archived' ga o'zgartirish (zaxira bo'lmaganda)
    const { error } = await supabase
      .from('products')
      .update({ status: 'archived' })
      .eq('id', product.id);
    if (error) throw error;
    return { type: 'archived' };
  };

  const deleteMutation = useMutation({
    mutationFn: deleteProductById,
    onSuccess: (data: { type: string }) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['pending-items-china'] });
      queryClient.invalidateQueries({ queryKey: ['archived-products'] });
      queryClient.invalidateQueries({ queryKey: ['tashkent-grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['tashkent-saleable-products'] });

      if (data.type === 'canceled') {
        toast({ title: "Buyurtma bekor qilindi", description: "Xitoydan kutilayotgan buyurtmalar o'chirildi. Ombor zaxirasi o'zgarishsiz qoldi." });
      } else {
        toast({ title: "Arxivga ko'chirildi", description: "Mahsulot arxivga ko'chirildi. Toshkent ombori → Arxiv tabidan qaytarishingiz mumkin." });
      }

      setDeleteDialogOpen(false);
      setProductToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: t('toast_error'), description: error.message, variant: 'destructive' });
      setDeleteDialogOpen(false);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (products: any[]) => {
      for (const product of products) {
        await deleteProductById(product);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['pending-items-china'] });
      queryClient.invalidateQueries({ queryKey: ['archived-products'] });
      queryClient.invalidateQueries({ queryKey: ['tashkent-grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['tashkent-saleable-products'] });
      toast({
        title: `${selectedProducts.size} ta mahsulot arxivga ko'chirildi`,
        description: "Toshkent ombori → Arxiv tabidan qaytarishingiz mumkin."
      });
      setSelectedProducts(new Set());
      setBulkDeleteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: t('toast_error'), description: error.message, variant: 'destructive' });
      setBulkDeleteDialogOpen(false);
    },
  });

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setOpen(true);
  };

  const handleDeleteClick = (product: any) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEditingProduct(null);
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories?.find(c => c.id === categoryId)?.name;
  };

  // Extract unique brands for filter
  const uniqueBrands = useMemo(() => {
    if (!products) return [];
    const brands = products.map(p => p.brand).filter((b): b is string => !!b);
    return [...new Set(brands)].sort();
  }, [products]);

  const filteredProducts = products?.filter(product => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        product.name.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query) ||
        product.brand?.toLowerCase().includes(query) ||
        product.uuid?.toLowerCase().includes(query) ||
        product.notes?.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }

    // Category filter (by category_id)
    if (categoryFilter !== 'all' && product.category_id !== categoryFilter) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && product.status !== statusFilter) {
      return false;
    }

    // Advanced filters
    // Price range
    if (advancedFilters.priceMin && product.price && product.price < parseFloat(advancedFilters.priceMin)) {
      return false;
    }
    if (advancedFilters.priceMax && product.price && product.price > parseFloat(advancedFilters.priceMax)) {
      return false;
    }

    // Weight range
    if (advancedFilters.weightMin && product.weight && product.weight < parseFloat(advancedFilters.weightMin)) {
      return false;
    }
    if (advancedFilters.weightMax && product.weight && product.weight > parseFloat(advancedFilters.weightMax)) {
      return false;
    }

    // Brand filter
    if (advancedFilters.brand !== 'all' && product.brand !== advancedFilters.brand) {
      return false;
    }

    // Date range
    if (advancedFilters.dateFrom) {
      const productDate = new Date(product.created_at);
      const fromDate = new Date(advancedFilters.dateFrom);
      if (productDate < fromDate) return false;
    }
    if (advancedFilters.dateTo) {
      const productDate = new Date(product.created_at);
      const toDate = new Date(advancedFilters.dateTo);
      toDate.setHours(23, 59, 59);
      if (productDate > toDate) return false;
    }

    // Marketplace ready filter
    if (advancedFilters.marketplaceReady !== null && product.marketplace_ready !== advancedFilters.marketplaceReady) {
      return false;
    }

    // Has variants filter
    if (advancedFilters.hasVariants !== null && product.has_variants !== advancedFilters.hasVariants) {
      return false;
    }

    return true;
  });

  // === UMUMIY INVENTAR QIYMATI ===
  // Filtr qilingan mahsulotlar asosida jami CNY va UZS qiymati hisoblanadi
  const inventarySummary = useMemo(() => {
    if (!filteredProducts?.length) return null;
    const safeCnyToUzs = cnyToUzs >= 500 ? cnyToUzs : 1750;
    const safeUsdToUzs = usdToUzs >= 500 ? usdToUzs : 12800;

    let totalCNY = 0;     // Xitoy tannarx yig'indisi (CNY)
    let totalUZS = 0;     // So'm ekvivalenti
    let totalQty = 0;     // Jami dona soni
    let coveredCount = 0; // Narxi ma'lum mahsulotlar soni

    for (const p of filteredProducts) {
      const qty = p.quantity || 1;
      // cost_price = yakuniy tannarx (purchase_currency da)
      // price = sotib olish narxi (purchase_currency da)
      const unitCost = (p.cost_price || p.price) as number | null;
      const currency = p.purchase_currency || 'CNY';
      totalQty += qty;

      if (unitCost && unitCost > 0) {
        coveredCount++;
        const unitCostCNY = currency === 'USD'
          ? unitCost * (safeUsdToUzs / safeCnyToUzs)
          : currency === 'UZS'
          ? unitCost / safeCnyToUzs
          : unitCost; // CNY

        totalCNY += unitCostCNY * qty;
        totalUZS += unitCostCNY * safeCnyToUzs * qty;
      }
    }

    return { totalCNY, totalUZS, totalQty, coveredCount, total: filteredProducts.length };
  }, [filteredProducts, cnyToUzs, usdToUzs]);


  if (!roleLoading && !canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">{t('prod_access_denied')}</h2>
        <p className="text-muted-foreground">{t('prod_access_denied_msg')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            {t('products')}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t('prod_subtitle')}
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditingProduct(null); // MUHIM: Avval tozalash
              setOpen(true);
            }}
            className="gap-2 bg-gradient-to-r from-primary to-secondary shadow-lg shadow-primary/20 min-h-[44px] w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            {t('addProduct')}
          </Button>
        )}
      </div>

      <Card className="p-4 sm:p-6 bg-card border-border">
        <div className="flex flex-col gap-4 mb-6">
          {/* Search and basic filters row */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search') + '...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-input border-border min-h-[44px]"
              />
            </div>

            <div className="flex gap-2 sm:gap-4">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="flex-1 sm:flex-none sm:w-[180px] bg-input border-border min-h-[44px]">
                  <SelectValue placeholder={t('prod_category_placeholder')} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">{t('prod_all_categories')}</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {"—".repeat(cat.level)} {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 sm:flex-none sm:w-[160px] bg-input border-border min-h-[44px]">
                  <SelectValue placeholder={t('prod_status_placeholder')} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">{t('prod_all_statuses')}</SelectItem>
                  <SelectItem value="pending">{t('prod_status_pending')}</SelectItem>
                  <SelectItem value="packed">{t('prod_status_packed')}</SelectItem>
                  <SelectItem value="in_transit">{t('prod_status_in_transit')}</SelectItem>
                  <SelectItem value="arrived">{t('prod_status_arrived')}</SelectItem>
                  <SelectItem value="sold">{t('prod_status_sold')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advanced filters and Export/Import row */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <ProductAdvancedFilters
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
              brands={uniqueBrands}
            />
            <ProductExportImport
              products={filteredProducts || []}
              categories={categories || []}
            />
          </div>
        </div>

        {/* === UMUMIY INVENTAR YIG'INDISI === */}
        {inventarySummary && inventarySummary.totalCNY > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/50 border border-border/60 text-sm">
            <span className="text-muted-foreground font-medium">
              📦 {inventarySummary.total} mahsulot
            </span>
            <span className="text-muted-foreground opacity-40">|</span>
            <span className="text-muted-foreground">
              {inventarySummary.totalQty.toLocaleString('en-US')} dona
            </span>
            <span className="text-muted-foreground opacity-40">|</span>
            <span className="font-semibold text-foreground">
              Jami: ¥{inventarySummary.totalCNY.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-xs opacity-60">CNY</span>
            </span>
            <span className="opacity-40">/</span>
            <span className="text-primary font-bold">
              {new Intl.NumberFormat('uz-UZ').format(Math.round(inventarySummary.totalUZS))} so'm
            </span>
            {inventarySummary.coveredCount < inventarySummary.total && (
              <span className="text-xs text-muted-foreground opacity-60">
                ({inventarySummary.coveredCount}/{inventarySummary.total} narxi ma&apos;lum)
              </span>
            )}
          </div>
        )}

        {/* Bulk selection toolbar */}
        {canEdit && selectedProducts.size > 0 && (
          <div className="flex items-center gap-4 p-3 bg-primary/10 rounded-lg mb-4 border border-primary/20">
            <Checkbox
              checked={selectedProducts.size === filteredProducts?.length && filteredProducts.length > 0}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelectedProducts(new Set(filteredProducts?.map(p => p.id)));
                } else {
                  setSelectedProducts(new Set());
                }
              }}
            />
            <span className="text-sm font-medium text-foreground">
              {t('prod_selected', { count: selectedProducts.size })}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {t('prod_delete_all')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedProducts(new Set())}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              {t('cancel')}
            </Button>
          </div>
        )}

        {/* Select all checkbox and Results count */}
        {filteredProducts && products && (
          <div className="flex items-center gap-3 mb-4">
            {canEdit && filteredProducts.length > 0 && (
              <Checkbox
                checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
                  } else {
                    setSelectedProducts(new Set());
                  }
                }}
              />
            )}
            <span className="text-sm text-muted-foreground">
              {t('prod_count', { filtered: filteredProducts.length, total: products.length })}
            </span>
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton count={5} />
        ) : filteredProducts && filteredProducts.length > 0 ? (
          <div className="space-y-3">
            {filteredProducts.map((product) => (
              isMobile ? (
                <div key={product.id} className={selectedProducts.has(product.id) ? 'ring-2 ring-primary rounded-xl' : ''}>
                  {canEdit && (
                    <div className="flex items-center gap-2 px-2 pb-1">
                      <Checkbox
                        checked={selectedProducts.has(product.id)}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedProducts);
                          if (checked) newSelected.add(product.id);
                          else newSelected.delete(product.id);
                          setSelectedProducts(newSelected);
                        }}
                      />
                    </div>
                  )}
                  <MobileProductCard
                    product={product}
                    categoryName={getCategoryName(product.category_id)}
                    canEdit={canEdit}
                    onEdit={() => handleEdit(product)}
                    onDelete={() => handleDeleteClick(product)}
                  />
                </div>
              ) : (
                <div
                  key={product.id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-muted rounded-xl hover:bg-muted/70 transition-colors ${selectedProducts.has(product.id) ? 'ring-2 ring-primary bg-primary/5' : ''
                    }`}
                >
                  <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                    {canEdit && (
                      <Checkbox
                        checked={selectedProducts.has(product.id)}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedProducts);
                          if (checked) newSelected.add(product.id);
                          else newSelected.delete(product.id);
                          setSelectedProducts(newSelected);
                        }}
                      />
                    )}
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-mono text-xs">
                        {product.uuid?.slice(0, 4)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-foreground">{product.name}</h3>
                        {product.has_variants && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Layers className="h-3 w-3" />
                            {t('prod_has_variants')}
                          </Badge>
                        )}
                        {product.marketplace_ready && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                            Marketplace
                          </Badge>
                        )}
                        {pendingItemsData?.[product.id] && pendingItemsData[product.id] > 0 && (
                          <Badge variant="outline" className="text-xs text-orange-500 border-orange-500 gap-1">
                            <Package className="h-3 w-3" />
                            {t('prod_china_pending', { count: pendingItemsData[product.id] })}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {product.brand && `${product.brand} • `}
                        {getCategoryName(product.category_id) || product.category || t('prod_no_category')}
                        {pendingItemsData?.[product.id] > 0 
                          ? ` • Faol: ${pendingItemsData[product.id]} ${t('pcs')}` 
                          : (product.quantity ? ` • Jami: ${product.quantity} ${t('pcs')}` : '')}
                        {product.weight && ` • ${product.weight}kg`}
                      </p>
                      {(product.price || product.cost_price) && (() => {
                        const priceCNY = product.price as number | null;
                        const costCNY = product.cost_price as number | null;
                        const totalShipping = product.shipping_cost_to_china as number | null;
                        const qty = product.quantity || 1;
                        const currency = product.purchase_currency || 'CNY';
                        
                        // Safety clamps: exchange rates must be realistic
                        const safeCnyToUzs = cnyToUzs >= 100 ? cnyToUzs : 1750;
                        const safeUsdToUzs = usdToUzs >= 100 ? usdToUzs : 12800;
                        
                        // Valyuta kursini aniqlash
                        const rateToUzs = currency === 'CNY' ? safeCnyToUzs
                          : currency === 'USD' ? safeUsdToUzs
                          : 1;
                        
                        // Yetkazish narxi 1 dona uchun
                        const shippingPerUnit = totalShipping && qty > 0
                          ? Math.round((totalShipping / qty) * 10000) / 10000
                          : null;
                        
                        // Jami tannarx UZS da
                        const tannarxUZS = costCNY
                          ? Math.round(costCNY * rateToUzs)
                          : priceCNY
                          ? Math.round(priceCNY * rateToUzs)
                          : null;

                        const currSymbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
                        // MUHIM: 'en-US' locale ishlatiladi — ba'zi tizimlarda toLocaleString()
                        // vergulni kasrli belgisi sifatida ishlatadi (masalan 1.925 → "1,925")
                        // Bu ¥1.925 ni ¥1,925 kabi ko'rsatib muammo chiqaradi
                        const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });

                        return (
                          <div className="text-xs mt-1 text-muted-foreground space-y-0.5">
                            {/* Formula: Narx + Yetkazish = Tannarx */}
                            <div className="flex items-center flex-wrap gap-1">
                              {priceCNY && (
                                <span>{currSymbol}{fmt(priceCNY)} <span className="opacity-60">(Narx)</span></span>
                              )}
                              {shippingPerUnit && shippingPerUnit > 0 && (
                                <>
                                  <span className="opacity-50">+</span>
                                  <span>¥{fmt(shippingPerUnit)} <span className="opacity-60">(Yetkazish/dona)</span></span>
                                </>
                              )}
                              {costCNY && costCNY !== priceCNY && (
                                <>
                                  <span className="opacity-50">=</span>
                                  <span className="font-semibold text-foreground">
                                    {currSymbol}{fmt(costCNY)} <span className="opacity-60">(CNY/dona)</span>
                                    {tannarxUZS && (
                                      <span className="ml-1 text-primary">
                                        ≈ {new Intl.NumberFormat('uz-UZ').format(tannarxUZS)} so'm
                                      </span>
                                    )}
                                  </span>
                                </>
                              )}
                            </div>
                            {/* Mahsulot jami: barcha dona * tannarx/dona */}
                            {(() => {
                              const actualQty = product.quantity as number | null;
                              if (!actualQty || actualQty < 1) return null;

                              // Eng aniq per-unit narxni aniqlash —
                              // price + shipping formula mavjud bo'lsa, u ishonchli (kichik CNY raqam)
                              // Aks holda cost_price ishlatiladi (lekin xato kiritilgan bo'lishi mumkin)
                              const formulaUnitCost = priceCNY
                                ? priceCNY + (shippingPerUnit || 0)
                                : null;
                              const unitCostForJami = formulaUnitCost ?? (costCNY as number | null) ?? null;

                              if (!unitCostForJami) return null;

                              // Xavfsizlik tekshiruvi: 1 dona narxi CNY da 500 dan oshsa,
                              // ma'lumot xato kiritilgan bo'lishi mumkin (masalan 1925 o'rniga 1.925)
                              if (currency === 'CNY' && unitCostForJami > 500) {
                                return (
                                  <div className="flex items-center gap-1 text-xs mt-1 pt-1 border-t border-border/30 text-orange-500">
                                    <span>⚠️ Jami: mahsulotni qayta saqlang (narx xato bo'lishi mumkin)</span>
                                  </div>
                                );
                              }

                              const totalCNY = unitCostForJami * actualQty;
                              const totalUZS = Math.round(totalCNY * rateToUzs);
                              return (
                                <div className="flex items-center flex-wrap gap-1 text-xs mt-1 pt-1 border-t border-border/30">
                                  <span className="opacity-60 font-medium">Jami ({actualQty.toLocaleString('en-US')} dona):</span>
                                  <span className="font-bold text-foreground">
                                    {currSymbol}{totalCNY.toLocaleString('en-US', { maximumFractionDigits: 2 })} CNY
                                  </span>
                                  <span className="text-primary font-semibold">
                                    ≈ {new Intl.NumberFormat('uz-UZ').format(totalUZS)} so'm
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                      <ProductItemsView productId={product.id} productUuid={product.uuid} hasVariants={product.has_variants} />
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex gap-2 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-border/40 flex-shrink-0">
                      <StockSyncButton
                        productId={product.id}
                        productUuid={product.uuid}
                        hasVariants={product.has_variants || false}
                      />
                      <Button variant="outline" size="sm" onClick={() => handleEdit(product)} className="gap-1.5 min-h-[40px] flex-1 sm:flex-none px-3">
                        <Edit className="h-4 w-4" />
                        <span className="sm:hidden lg:inline">{t('edit')}</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteClick(product)} className="gap-1.5 border-destructive text-destructive hover:bg-destructive/10 min-h-[40px] flex-1 sm:flex-none px-3">
                        <Trash2 className="h-4 w-4" />
                        <span className="sm:hidden lg:inline">{t('delete')}</span>
                      </Button>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <div className="text-center py-12">
            <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-2">
              {t('prod_no_results')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('prod_no_results_hint')}
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('prod_no_products')}
            </h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              {t('prod_no_products_desc')}
            </p>
            <Button
              onClick={() => setOpen(true)}
              className="gap-2 bg-gradient-to-r from-primary to-secondary"
            >
              <Plus className="h-4 w-4" />
              {t('prod_add_first')}
            </Button>
          </div>
        )}
      </Card>

      {/* Product Form Dialog */}
      <ProductFormDialog
        open={open}
        onOpenChange={handleDialogClose}
        editingProduct={editingProduct}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('prod_delete_title')}
        description={
          productToDelete?.tashkent_manual_stock > 0
            ? `"${productToDelete?.name}" — Toshkent omborida ${productToDelete.tashkent_manual_stock} dona zaxirasi bor. Arxivga ko'chirilsa, Toshkent omboridan ham yo'qoladi. Davom etasizmi?`
            : t('prod_delete_desc', { name: productToDelete?.name })
        }
        confirmText={t('delete')}
        cancelText={t('cancel')}
        onConfirm={() => productToDelete && deleteMutation.mutate(productToDelete)}
        variant="destructive"
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title={t('prod_bulk_delete_title', { count: selectedProducts.size })}
        description={t('prod_bulk_delete_desc')}
        confirmText={t('prod_bulk_delete_confirm', { count: selectedProducts.size })}
        cancelText={t('cancel')}
        onConfirm={() => bulkDeleteMutation.mutate(Array.from(selectedProducts).map(id => products?.find(p => p.id === id)).filter(Boolean))}
        variant="destructive"
        isLoading={bulkDeleteMutation.isPending}
      />
    </div>
  );
}
