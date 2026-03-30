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
    <Card className="overflow-hidden border-border/50 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/20">
      <button
        type="button"
        className="w-full px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-background to-muted/10 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 shadow-sm shrink-0 border border-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-[15px] text-foreground flex flex-wrap items-center gap-2">
              {docNumber ? `№ ${docNumber}` : 'Skanerlangan hujjat'}
              {docType && (
                <Badge variant="secondary" className="text-[10px] tracking-wide uppercase font-bold bg-muted/60 border-border/40 text-muted-foreground">
                  {docType}
                </Badge>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-medium">
              {[fileName, fileSize].filter(Boolean).join(' · ')}
              {partner && (
                <span className="flex items-center gap-1.5 text-foreground/70 before:content-['•'] before:text-muted/40">
                  {partner}
                </span>
              )}
              {docDate && (
                <span className="flex items-center gap-1 text-foreground/70 justify-center before:content-['•'] before:text-muted/40 before:mr-1">
                  <Clock className="h-3 w-3" /> {docDate}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0 self-end md:self-auto">
          {fileUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-semibold shadow-sm border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
              onClick={openDocument}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Ko'rish
            </Button>
          )}

          <Badge variant="outline" className="h-8 px-3 gap-1.5 text-sm font-semibold bg-background shadow-sm border-border/60">
            <span className="text-foreground">{totalItems} <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider ml-0.5">ta</span></span>
            {(result.total_value ?? 0) > 0 && (
              <>
                <span className="text-muted/30">|</span>
                <span className="text-primary">{fmt(result.total_value)} UZS</span>
              </>
            )}
          </Badge>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors ml-1"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            title="O'chirish"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/40 border border-border/40">
            {expanded ? <ChevronDown className="h-4 w-4 text-foreground/60" /> : <ChevronRight className="h-4 w-4 text-foreground/60" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="bg-[#fcfdff] dark:bg-background border-t border-border/40 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="p-5 md:px-6">
            {result.items && result.items.length > 0 ? (
              <div className="rounded-xl border border-border/50 bg-background overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border/50">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Mahsulot nomi</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-40">Miqdor</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-44">SKU / Barcode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {result.items.map((item, idx) => (
                      <tr 
                        key={idx} 
                        className="group hover:bg-primary/[0.02] transition-colors duration-150"
                      >
                        <td className="py-3 px-4 font-medium text-foreground/90">
                          {item.product_name || 'Noma\'lum mahsulot'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="secondary" className={cn(
                            "px-2 py-0.5 text-xs font-bold border-border/40 shadow-sm",
                            item.quantity > 1 ? "bg-blue-50 text-blue-600 border-blue-200/60 dark:bg-blue-500/10 dark:text-blue-400" : "bg-muted/60 text-muted-foreground"
                          )}>
                            {item.quantity > 1 ? `× ${item.quantity}` : `${item.quantity} dona`}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[13px] text-muted-foreground/80 group-hover:text-foreground/70 transition-colors">
                          {item.sku || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center flex flex-col items-center justify-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mb-1">
                  <FileText className="h-5 w-5 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">Mahsulotlar ro'yxati topilmadi</p>
                <p className="text-xs text-muted-foreground">Scan qilingan faylda mahsulotlar aniqlanmadi.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
