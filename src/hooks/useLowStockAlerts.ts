import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ProductType = 'small' | 'large' | 'medium';

export interface LowStockAlert {
  id: string; // Virtual UUID
  product_id: string;
  name: string;
  current_stock: number;
  threshold: number;
  product_type: ProductType;
  category_name?: string;
  avg_daily_sales: number;
  days_left: number;
}

export const getProductThreshold = (productName: string, categoryName?: string | null): { threshold: number, type: ProductType } => {
  const name = (productName + " " + (categoryName || "")).toLowerCase();
  
  // High-volume, small items
  const smallKeywords = [
    'achki', 'ochki', 'ko\'zoynak', 'quloqchin', 'naushnik', 
    'kabel', 'chexol', 'aksessuar', 'soat', 'braslet', 'uzuk', 
    'sumka', 'kosmetika', 'atirlar', 'ruchka', 'paypoq', 'mayda', 'kichik', 
    'fleshka', 'xotira', 'mikrofon', 'powerbank', 'karobka', 'qadoq'
  ];
  
  // Low-volume, large items
  const largeKeywords = [
    'noutbuk', 'kompyuter', 'televizor', 'muzlatgich', 'konditsioner', 
    'kir yuvish', 'velosiped', 'kalyaska', 'mebel', 'skuter', 'tv', 'monitor',
    'kreslo', 'divan', 'stol', 'stul'
  ];

  if (smallKeywords.some(k => name.includes(k))) return { threshold: 50, type: 'small' };
  if (largeKeywords.some(k => name.includes(k))) return { threshold: 5, type: 'large' };
  return { threshold: 15, type: 'medium' }; // default
}

export function useLowStockAlerts() {
  return useQuery({
    queryKey: ['low-stock-virtual-alerts'],
    queryFn: async () => {
      // Fetch active products with basic stock info
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          category_id,
          tashkent_manual_stock,
          avg_daily_sales,
          categories_hierarchy (
            name
          ),
          product_variants (
            id,
            stock_quantity,
            variant_attributes
          )
        `)
        .eq('status', 'active')
        .neq('source', 'marketplace_auto');
      
      if (error) {
        console.error('Failed to fetch products for low stock alerts:', error);
        return [];
      }

      // Check DB actual item counts for Tashkent
      const { data: itemCounts } = await supabase
        .from('product_items')
        .select('product_id')
        .in('status', ['in_tashkent', 'arrived', 'arrived_pending']);
        
      const tashkentItemCounts: Record<string, number> = {};
      itemCounts?.forEach(item => {
        tashkentItemCounts[item.product_id] = (tashkentItemCounts[item.product_id] || 0) + 1;
      });

      const alerts: LowStockAlert[] = [];

      data?.forEach(product => {
        const categoryName = (product.categories_hierarchy as any)?.name || null;
        const variants = (product as any).product_variants || [];
        
        const { threshold, type } = getProductThreshold(product.name, categoryName);
        const dailySales = product.avg_daily_sales || 0;

        // If product has variants, analyze each variant contextually
        if (variants.length > 0) {
          variants.forEach((v: any) => {
            const stock = v.stock_quantity || 0; // variants rely strictly on manual stock currently
            if (stock <= threshold) {
              const attrs = v.variant_attributes ? Object.values(v.variant_attributes).join(' ') : 'Variant';
              const daysLeft = dailySales > 0 ? Math.floor(stock / dailySales) : 0;
              
              alerts.push({
                id: `low-stock-var-${v.id}`,
                product_id: product.id,
                name: `${product.name} (${attrs})`,
                current_stock: stock,
                threshold,
                product_type: type,
                category_name: categoryName,
                avg_daily_sales: dailySales,
                days_left: daysLeft
              });
            }
          });
        } else {
          // Standard product without variants
          const manualStock = product.tashkent_manual_stock || 0;
          const scannerStock = tashkentItemCounts[product.id] || 0;
          const totalStock = manualStock + scannerStock;

          if (totalStock <= threshold) {
            const daysLeft = dailySales > 0 ? Math.floor(totalStock / dailySales) : 0;
            alerts.push({
              id: `low-stock-prod-${product.id}`,
              product_id: product.id,
              name: product.name,
              current_stock: totalStock,
              threshold,
              product_type: type,
              category_name: categoryName,
              avg_daily_sales: dailySales,
              days_left: daysLeft
            });
          }
        }
      });

      // Sort with critical zero-stock first, then by days left
      return alerts.sort((a, b) => {
        if (a.current_stock === 0 && b.current_stock > 0) return -1;
        if (b.current_stock === 0 && a.current_stock > 0) return 1;
        
        // Secondary sort: Days left minimum
        if (a.days_left > 0 && b.days_left > 0) return a.days_left - b.days_left;
        return a.current_stock - b.current_stock;
      });
    },
    // Cache for 5 minutes since these don't strictly require millisecond-live updates like chats do
    staleTime: 5 * 60 * 1000, 
  });
}
