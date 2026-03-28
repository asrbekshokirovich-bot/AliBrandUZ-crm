import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText, Eye, X, ChevronDown, ChevronRight, Clock,
} from 'lucide-react';
import type { ScanResult } from '@/hooks/useReturnScanner';
import { cn } from '@/lib/utils';

interface ScanResultCardProps {
  result: ScanResult;
  file?: File;
  onDismiss: () => void;
}

function fmt(n: number | string): string {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  return isNaN(v) ? String(n) : v.toLocaleString('uz-UZ');
}

export function ScanResultCard({ result, file, onDismiss }: ScanResultCardProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const openDocument = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fileUrl) window.open(fileUrl, '_blank');
  };

  const docNumber = result.document?.document_number;
  const docDate = result.document?.date || '';
  const partner = result.document?.partner || '';
  const docType = result.classification?.document_type || result.document?.document_type || '';
  const totalItems = result.total_items ?? result.items?.length ?? 0;
  const fileName = file?.name ?? '';
  const fileSize = file ? `${(file.size / 1024).toFixed(0)}KB` : '';

  // Description line (like nakladnoy expanded line)
  const descLine = [docDate, docType, partner].filter(Boolean).join('  ');

  return (
    <Card className="overflow-hidden">
      {/* ── Collapsible trigger (same style as HandoverInvoicesTab) ── */}
      <button
        type="button"
        className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-foreground">
              {docNumber ? `№${docNumber}` : 'Skanerlangan hujjat'}
            </p>
            <p className="text-xs text-muted-foreground">
              {[fileName, fileSize].filter(Boolean).join(' · ')}
              {partner && fileName ? ` · ${partner}` : partner}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View button */}
          {fileUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
              onClick={openDocument}
            >
              <Eye className="h-3.5 w-3.5" />
              Hujjatni ko'rish
            </Button>
          )}

          {/* Item count badge */}
          <Badge variant="default" className="gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {totalItems}
          </Badge>

          {/* Dismiss */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            title="Yopish"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Expand chevron */}
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* ── Expanded content (same pattern as nakladnoy orders) ── */}
      {expanded && (
        <div className="px-4 pb-4 border-t pt-3 space-y-3">
          {/* Description line */}
          {descLine && (
            <p className="text-xs text-muted-foreground">
              {descLine}
            </p>
          )}

          {/* Jami summa */}
          {(result.total_value ?? 0) > 0 && (
            <p className="text-xs font-semibold text-foreground">
              Jami: {fmt(result.total_value)} UZS
            </p>
          )}

          {/* Items as badge grid (same layout as order numbers in nakladnoy) */}
          {result.items && result.items.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {result.items.map((item, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-xs font-mono max-w-[200px] truncate"
                  title={`${item.product_name} — ${item.quantity} dona — ${fmt(item.total_price)}`}
                >
                  {item.product_name || `Mahsulot ${idx + 1}`}
                  {item.quantity > 1 && (
                    <span className="ml-1 opacity-60">×{item.quantity}</span>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Mahsulotlar ro'yxati mavjud emas</p>
          )}
        </div>
      )}
    </Card>
  );
}
