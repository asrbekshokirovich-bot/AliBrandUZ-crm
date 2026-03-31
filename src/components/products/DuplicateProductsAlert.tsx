import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { findDuplicateGroups, DuplicateGroup } from '@/lib/stringUtils';
import { MergeProductsDialog } from './MergeProductsDialog';

interface Product {
  id: string;
  name: string;
  main_image_url: string | null;
  category_id?: string | null;
}

export function DuplicateProductsAlert() {
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup<Product> | null>(null);

  // Fetch only active products
  const { data: activeProducts = [], isLoading } = useQuery({
    queryKey: ['active-products-for-duplicates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, main_image_url, category_id')
        .eq('status', 'active');
        
      if (error) throw error;
      return data as Product[];
    },
    // Don't refetch constantly to save DB hits
    staleTime: 60 * 1000 * 5, 
    refetchOnWindowFocus: false,
  });

  // Calculate duplicate groups in memory
  const duplicateGroups = useMemo(() => {
    if (!activeProducts || activeProducts.length === 0) return [];
    
    // Use our string matching algorithm to group items
    const groups = findDuplicateGroups(activeProducts, (p) => p.name);
    return groups;
  }, [activeProducts]);

  if (isLoading || duplicateGroups.length === 0) {
    return null;
  }

  // Define color and styling for the banner
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="mt-0.5 bg-yellow-500/20 p-2 rounded-full shrink-0">
          <AlertCircle className="h-5 w-5 text-yellow-600" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-yellow-700 text-sm md:text-base mb-1">
            Diqqat! Tizimda ehtimoliy qo'shaloq (duplikat) mahsulotlar aniqlandi
          </h3>
          <p className="text-sm text-yellow-700/80 mb-4 max-w-3xl">
            Sotuvda mavjud bo'lgan ayrim mahsulotlaringizning nomlari juda o'xshash yoki aynan bir xil. Iltimos, ularni yagona mahsulotga birlashtiring. Aks holda ombor zaxira hisobt-kitobi aralashib ketishi mumkin.
          </p>
          
          <div className="space-y-3">
            {duplicateGroups.map((group, idx) => (
              <div key={idx} className="bg-background/80 rounded-md p-3 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center border border-yellow-500/20">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Guruh: {group.normalizedName}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {group.items.map((item, i) => (
                      <span key={item.id} className="inline-flex items-center text-sm bg-muted px-2 py-1 rounded">
                        <span className="font-medium truncate max-w-[150px]">{item.name}</span>
                        {i < group.items.length - 1 && <ArrowRight className="h-3 w-3 mx-2 text-muted-foreground shrink-0" />}
                      </span>
                    ))}
                  </div>
                </div>
                
                <Button 
                  size="sm" 
                  className="shrink-0 bg-yellow-500 hover:bg-yellow-600 text-white w-full sm:w-auto"
                  onClick={() => setSelectedGroup(group)}
                >
                  Ko'rib chiqish
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedGroup && (
        <MergeProductsDialog
          open={!!selectedGroup}
          onOpenChange={(open) => !open && setSelectedGroup(null)}
          products={selectedGroup.items}
        />
      )}
    </div>
  );
}
