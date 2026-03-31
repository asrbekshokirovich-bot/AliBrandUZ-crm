import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Merge, AlertTriangle } from 'lucide-react';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LazyImage } from '@/components/ui/lazy-image';

interface Product {
  id: string;
  name: string;
  main_image_url: string | null;
  category_id?: string | null;
}

interface MergeProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
}

export function MergeProductsDialog({ open, onOpenChange, products }: MergeProductsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [primaryId, setPrimaryId] = useState<string>(products[0]?.id || '');
  const [variantMappings, setVariantMappings] = useState<Record<string, string>>({});

  // Fetch variants for the selected primary product
  const { data: primaryVariants, isLoading: isLoadingVariants } = useQuery({
    queryKey: ['product-variants', primaryId],
    queryFn: async () => {
      if (!primaryId) return [];
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', primaryId)
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!primaryId && open,
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const wrongProducts = products.filter(p => p.id !== primaryId);
      if (wrongProducts.length === 0) throw new Error("Kamida ikkita mahsulot kerak");

      for (const wrongP of wrongProducts) {
        let updateData: any = { product_id: primaryId };
        
        // If the primary product has variants, map it to the selected variant
        // If not selected, it will just not have a variant_id
        if (variantMappings[wrongP.id] && variantMappings[wrongP.id] !== 'no_variant') {
           updateData.variant_id = variantMappings[wrongP.id];
        }

        // Update product items connected to the wrong product
        const { error: itemsError } = await supabase
          .from('product_items')
          .update(updateData)
          .eq('product_id', wrongP.id);
          
        if (itemsError) throw itemsError;

        // Optionally, if product_variants exist on the wrong product, delete them first
        const { error: delVarError } = await supabase
          .from('product_variants')
          .delete()
          .eq('product_id', wrongP.id);
          
        if (delVarError) console.error("Warning: unhandled variants on deleted product", delVarError);

        // Delete the wrong product itself
        const { error: delProdError } = await supabase
            .from('products')
            .delete()
            .eq('id', wrongP.id);
            
        if (delProdError) throw delProdError;
      }
    },
    onSuccess: () => {
      toast.success("Mahsulotlar muvaffaqiyatli birlashtirildi!");
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-items'] });
      queryClient.invalidateQueries({ queryKey: ['tashkent-category-counts'] });
      queryClient.invalidateQueries({ queryKey: ['product-inventory-overview'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(`Xatolik yuz berdi: ${error.message}`);
    }
  });

  if (!products || products.length < 2) return null;

  const handlePrimaryChange = (value: string) => {
    setPrimaryId(value);
    setVariantMappings({});
  };

  const handleVariantMapChange = (wrongProductId: string, variantId: string) => {
    setVariantMappings(prev => ({
      ...prev,
      [wrongProductId]: variantId
    }));
  };

  // Determine if primary product has variants requiring mapping
  const needsVariantMapping = primaryVariants && primaryVariants.length > 0;
  const wrongProducts = products.filter(p => p.id !== primaryId);
  const isValid = !needsVariantMapping || wrongProducts.every(wp => variantMappings[wp.id]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2 text-primary">
            <Merge className="h-5 w-5" />
            Duplikatlarni Birlashtirish
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody className="space-y-6">
          <div className="bg-yellow-500/10 p-4 rounded-lg flex gap-3 text-sm text-yellow-600 border border-yellow-500/20">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>
              Quyidagi mahsulotlar nomi bir xil yoki juda o'xshash bo'lganligi uchun yagona 
              mahsulotga birlashtirish tavsiya etiladi. Qaysi biri asosiy (to'g'ri) nom ekanligini tanlang.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm">1. Asosiy nomni tanlang (U qoladi):</h3>
            <RadioGroup value={primaryId} onValueChange={handlePrimaryChange} className="space-y-2">
              {products.map(product => (
                <Label 
                  key={product.id}
                  htmlFor={product.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    primaryId === product.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'
                  }`}
                >
                  <RadioGroupItem value={product.id} id={product.id} />
                  <LazyImage 
                    src={product.main_image_url || '/placeholder.svg'} 
                    alt={product.name} 
                    className="h-10 w-10 rounded shrink-0 object-cover" 
                  />
                  <div className="font-medium">{product.name}</div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {needsVariantMapping && !isLoadingVariants && wrongProducts.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-sm">2. Xato tovarlarni qaysi variantga tushiraylik?</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Asosiy mahsulotingizda variantlar (rang/o'lcham) mavjud. O'chib ketayotgan mahsulotdagi zaxiralar asosiy guruhning qaysi variantiga qo'shilishini tanlang:
              </p>
              
              <div className="space-y-3">
                {wrongProducts.map(wp => (
                  <div key={wp.id} className="flex flex-col sm:flex-row gap-2 sm:items-center bg-muted/50 p-3 rounded-lg border">
                    <div className="flex-1 font-medium text-sm text-destructive line-through opacity-70">
                      {wp.name}
                    </div>
                    <div className="w-full sm:w-48 shrink-0">
                      <Select 
                        value={variantMappings[wp.id] || ''} 
                        onValueChange={(val) => handleVariantMapChange(wp.id, val)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Variant tanlang" />
                        </SelectTrigger>
                        <SelectContent zIndex={60}>
                          {primaryVariants.map(v => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.variant_attributes?.rang} {v.variant_attributes?.material}
                            </SelectItem>
                          ))}
                          <SelectItem value="no_variant" className="italic text-muted-foreground">
                            Variant belgilanmasin
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </ResponsiveDialogBody>

        <ResponsiveDialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Bekor qilish')}
          </Button>
          <Button 
            onClick={() => mergeMutation.mutate()} 
            disabled={mergeMutation.isPending || !isValid}
            className="flex items-center gap-2"
          >
            {mergeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
            Birlashtirish va ortiqchasini o'chirish
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
