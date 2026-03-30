import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StoreCategory } from './useStoreProducts';

export interface StoreCategoryWithCount extends StoreCategory {
  product_count: number;
}

export function useStoreCategoriesWithCounts() {
  return useQuery({
    queryKey: ['store-categories-with-counts'],
    queryFn: async () => {
      // Kategoriyalarni olish
      const { data: categories, error } = await supabase
        .from('store_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;

      // ✅ DB-darajada COUNT hisoblash - 1000 ta default limit muammosini hal qiladi
      // MUHIM: status='active' emas, neq('status','archived') - CRM bilan bir xil logika
      // Chunki ba'zi mahsulotlarda status null yoki boshqa qiymat bo'lishi mumkin
      const countResults = await Promise.all(
        (categories as StoreCategory[]).map(async (cat) => {
          const { count } = await supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'archived')
            .eq('store_category_id', cat.id);
          return { id: cat.id, count: count ?? 0 };
        })
      );

      const countMap = new Map<string, number>();
      countResults.forEach(r => countMap.set(r.id, r.count));

      return (categories as StoreCategory[])
        .map(c => ({ ...c, product_count: countMap.get(c.id) || 0 }))
        .filter(c => c.product_count > 0) as StoreCategoryWithCount[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
