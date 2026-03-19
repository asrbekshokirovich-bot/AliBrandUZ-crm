import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText, Eye, X, Hash, Calendar, Building2, Package,
  Wrench, XCircle, TrendingUp, ChevronDown, ChevronUp,
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

  // Create object URL for the file
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const openDocument = () => {
    if (fileUrl) window.open(fileUrl, '_blank');
  };

  const isImage = file?.type.startsWith('image');

  return (
    <Card className="border border-primary/20 bg-primary/5 overflow-hidden">
      {/* ── Card header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {result.document?.document_number
              ? `Hujjat #${result.document.document_number}`
              : 'Skanerlangan hujjat'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {file?.name ?? 'Fayl noma\'lum'} {file ? `· ${(file.size / 1024).toFixed(0)}KB` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {file && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs border-primary/30 text-primary hover:bg-primary/10"
              onClick={openDocument}
            >
              <Eye className="h-3.5 w-3.5" />
              Hujjatni ko'rish
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(v => !v)}
            title={expanded ? 'Yopish' : 'Ko\'proq'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDismiss}
            title="Yopish"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Summary row (always visible) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-border/50">
        {[
          { icon: Hash,       label: 'Raqam',    value: result.document?.document_number },
          { icon: Package,    label: 'Turi',     value: result.document?.document_type },
          { icon: Calendar,   label: 'Sana',     value: result.document?.date },
          { icon: Building2,  label: 'Hamkor',   value: result.document?.partner },
        ].map(({ icon: Icon, label, value }, i) => (
          <div key={i} className={cn('px-4 py-2.5', i < 3 && 'border-r border-border/40')}>
            <div className="flex items-center gap-1 mb-0.5">
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
            </div>
            <p className="text-sm font-semibold truncate">{value || '—'}</p>
          </div>
        ))}
      </div>

      {/* ── Totals strip ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/10">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">Jami:</span>
          <span className="text-sm font-bold text-primary">{fmt(result.total_value || 0)}</span>
        </div>
        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
          {result.total_items} ta mahsulot
        </Badge>
        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 gap-1">
          <Wrench className="h-3 w-3" /> {result.fixable_count ?? 0} tuzatib bo'ladi
        </Badge>
        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20 gap-1">
          <XCircle className="h-3 w-3" /> {result.unfixable_count ?? 0} bo'lmaydi
        </Badge>
      </div>

      {/* ── Expanded: items table + image preview ── */}
      {expanded && (
        <div className="border-t border-border/50 space-y-0">
          {/* Image preview strip (if image file) */}
          {isImage && fileUrl && (
            <div className="px-4 pt-3 pb-1 flex justify-start">
              <img
                src={fileUrl}
                alt="Hujjat rasmi"
                className="max-h-48 rounded-lg border border-border object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={openDocument}
                title="Kattalashtirish uchun bosing"
              />
            </div>
          )}

          {result.items && result.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-fixed">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium w-8">#</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Mahsulot</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium w-16">Miqdor</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium w-24">Narx</th>
                    <th className="text-right px-4 py-2 text-muted-foreground font-medium w-28">Jami</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item, idx) => (
                    <tr key={idx} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 truncate max-w-0" title={item.product_name}>{item.product_name || '—'}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{fmt(item.unit_price)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmt(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
