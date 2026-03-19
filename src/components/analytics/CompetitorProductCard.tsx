import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

export interface ScrapedProduct {
  id: string;
  marketplace: string;
  external_id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  url: string;
  image_url: string;
  similarity: number;
}

interface Props {
  product: ScrapedProduct;
}

export function CompetitorProductCard({ product }: Props) {
  const isUzum = product.marketplace.toLowerCase() === 'uzum';
  
  return (
    <Card className="overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow">
      <div className="relative aspect-square w-full bg-muted">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-muted-foreground text-sm">
            Rasm yo'q
          </div>
        )}
        <Badge 
          variant="secondary" 
          className={`absolute top-2 right-2 ${isUzum ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}
        >
          {isUzum ? '🟣 Uzum' : '🟡 Yandex'}
        </Badge>
        {/* Similarity Match Badge */}
        {product.similarity !== undefined && (
          <Badge className="absolute top-2 left-2 bg-green-500 text-white">
            {(product.similarity * 100).toFixed(0)}% Mos
          </Badge>
        )}
      </div>
      <CardContent className="p-4 flex-1">
        <h4 className="font-semibold text-sm line-clamp-2 mb-2" title={product.title}>
          {product.title}
        </h4>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold">
            {new Intl.NumberFormat('uz-UZ').format(product.price || 0)}
          </span>
          <span className="text-xs text-muted-foreground">{product.currency || 'UZS'}</span>
        </div>
      </CardContent>
      {product.url && (
        <CardFooter className="p-4 pt-0">
          <a 
            href={product.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center justify-center gap-1 w-full border border-primary/20 rounded-md py-2 px-3 hover:bg-primary/5 transition-colors"
          >
            Marketplace'da ko'rish
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardFooter>
      )}
    </Card>
  );
}
