import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Brain, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SemanticSearch } from "@/components/analytics/SemanticSearch";
import { CompetitorProductCard, ScrapedProduct } from "@/components/analytics/CompetitorProductCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function CompetitorAnalytics() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [results, setResults] = useState<ScrapedProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      // 1. Get embedding for the user's natural language query using the edge function
      const { data: embeddingData, error: embedError } = await supabase.functions.invoke('generate-embeddings', {
        body: { text_to_embed: query, return_only: true }
      });

      if (embedError) throw embedError;
      
      const queryEmbedding = embeddingData.embedding;

      if (!queryEmbedding) {
        throw new Error("Failed to generate search embedding");
      }

      // 2. Query the vector database using the RPC function we created
      const { data: products, error: searchError } = await supabase.rpc('match_competitor_products' as any, {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 12
      });

      if (searchError) throw searchError;

      const typedProducts = (products as unknown as ScrapedProduct[]) || [];
      setResults(typedProducts);
      
      if (typedProducts.length === 0) {
        toast({
          title: "Hech narsa topilmadi",
          description: "Kiritilgan so'rov bo'yicha raqobatchilar tovari topilmadi.",
        });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        title: "Qidiruvda xatolik yuz berdi",
        description: error.message || "Iltimos, qayta urinib ko'ring.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            AI Market Intelligence
          </h1>
          <p className="text-muted-foreground text-sm">
            Uzum va Yandex bozorlaridagi raqobatchi mahsulotlarni semantik qidirish
          </p>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <SemanticSearch onSearch={handleSearch} isSearching={isSearching} />
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Topilgan natijalar ({results.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((product) => (
              <CompetitorProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
