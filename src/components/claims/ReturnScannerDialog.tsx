import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ScanLine, Upload, X, FileText, FileSpreadsheet, Image as ImageIcon,
  Loader2, CheckCircle, AlertTriangle, RotateCcw, TrendingUp,
  Wrench, XCircle, ChevronDown, ChevronUp, Save,
} from 'lucide-react';
import { useReturnScanner, ScanResult, FinancialItem } from '@/hooks/useReturnScanner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ReturnScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (data: ScanResult, file?: File) => void;
}

// Per-item classification: both fixable & unfixable can be non-zero simultaneously
interface ItemClass {
  fixable_qty: number;   // 0 by default
  unfixable_qty: number; // 0 by default
  // normal_qty = item.quantity - fixable_qty - unfixable_qty (auto)
}

const ACCEPTED_EXT = '.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp';

const MIME_ICON: Record<string, React.FC<{ className?: string }>> = {
  'application/pdf': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  'application/vnd.ms-excel': FileSpreadsheet,
};

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const Icon = MIME_ICON[mimeType] ?? (mimeType.startsWith('image') ? ImageIcon : FileText);
  return <Icon className={className} />;
}

function fileTypeBadge(mimeType: string): { label: string; cls: string } {
  if (mimeType.includes('pdf')) return { label: 'PDF', cls: 'bg-red-100 text-red-700 border-red-200' };
  if (mimeType.includes('word') || mimeType.includes('docx')) return { label: 'DOCX', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return { label: 'XLSX', cls: 'bg-green-100 text-green-700 border-green-200' };
  if (mimeType.startsWith('image')) return { label: 'IMG', cls: 'bg-violet-100 text-violet-700 border-violet-200' };
  return { label: 'FILE', cls: 'bg-muted text-muted-foreground' };
}

function fmt(n: number | string): string {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  return isNaN(v) ? String(n) : v.toLocaleString('uz-UZ');
}

// Calculate tri-state summary
function calcSummary(items: FinancialItem[], classes: Record<number, ItemClass>) {
  let fixableQty = 0, fixableTotal = 0;
  let unfixableQty = 0, unfixableTotal = 0;
  let normalQty = 0, normalTotal = 0;
  items.forEach((item, idx) => {
    const c = classes[idx];
    const fq = c?.fixable_qty ?? 0;
    const uq = c?.unfixable_qty ?? 0;
    const nq = Math.max(0, item.quantity - fq - uq);
    fixableQty   += fq; fixableTotal   += fq * item.unit_price;
    unfixableQty += uq; unfixableTotal += uq * item.unit_price;
    normalQty    += nq; normalTotal    += nq * item.unit_price;
  });
  return { fixableQty, fixableTotal, unfixableQty, unfixableTotal, normalQty, normalTotal };
}

export function ReturnScannerDialog({ open, onOpenChange, onResult }: ReturnScannerDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [itemClass, setItemClass] = useState<Record<number, ItemClass>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [currentNakladnoyId, setCurrentNakladnoyId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { scanFiles, isScanning, result, error, progress, reset } = useReturnScanner();

  const handleClose = () => {
    setFiles([]); setItemClass({}); setExpandedRow(null); reset(); onOpenChange(false);
  };

  const handleFilesAdded = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !names.has(f.name))];
    });
  }, []);

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFilesAdded(e.dataTransfer.files);
  }, [handleFilesAdded]);

  useEffect(() => {
    if (files.length > 0 && !isScanning && !result) scanFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Auto-save to marketplace_returns when scan result arrives
  useEffect(() => {
    if (!result) return;
    setItemClass({}); setExpandedRow(null); setSavedCount(null); setCurrentNakladnoyId(null);

    if (!result.items || result.items.length === 0) return;

    const partnerLower = (result.document?.partner || '').toLowerCase();
    const platform = partnerLower.includes('yandex') ? 'yandex' : 'uzum';

    const docType = (result.document?.document_type || '').toLowerCase();
    const returnType = docType.includes('defect') || docType.includes('brak') ? 'fbs_defect'
      : docType.includes('fbo') ? 'fbo_return'
      : 'fbs_seller';

    const nowUzb = new Date();
    nowUzb.setUTCHours(nowUzb.getUTCHours() + 5);
    const returnDate = nowUzb.toISOString();
    const nakladnoyId = result.document?.document_number || `scan-${Date.now()}`;
    setCurrentNakladnoyId(nakladnoyId);

    const rows = result.items.map((item, idx) => ({
      external_order_id: `scan-${nakladnoyId}-${idx}-${Date.now()}`,
      platform,
      store_name: result.document?.partner || 'Noma\'lum',
      product_title: item.product_name || 'Noma\'lum mahsulot',
      sku_title: item.sku || null,
      quantity: item.quantity || 1,
      amount: item.total_price || null,
      currency: 'UZS',
      return_type: returnType,
      return_date: returnDate,
      nakladnoy_id: nakladnoyId,
      resolution: 'pending',
      image_url: null,
    }));

    setIsSaving(true);
    supabase.functions.invoke('save-scanned-returns', { body: { rows } })
      .then(({ error: fnErr }) => {
        if (fnErr) {
          console.error('[auto-save-returns]', fnErr);
          toast.error('Saqlashda xatolik: ' + fnErr.message);
        } else {
          setSavedCount(rows.length);
          toast.success(`${rows.length} ta tovar "Kutilayotgan qaytarishlar" ga saqlandi ✓`);
        }
      })
      .finally(() => setIsSaving(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  /** clamp and update one of the qty fields, ensuring fixable+unfixable <= total */
  const setClassQty = (idx: number, field: 'fixable_qty' | 'unfixable_qty', raw: number, total: number) => {
    setItemClass(prev => {
      const cur = prev[idx] ?? { fixable_qty: 0, unfixable_qty: 0 };
      const other = field === 'fixable_qty' ? cur.unfixable_qty : cur.fixable_qty;
      const clamped = Math.max(0, Math.min(raw, total - other));
      return { ...prev, [idx]: { ...cur, [field]: clamped } };
    });
  };

  /** Toggle a field: if already positive set to 0, else set to remaining qty */
  const toggleField = (idx: number, field: 'fixable_qty' | 'unfixable_qty', total: number) => {
    setItemClass(prev => {
      const cur = prev[idx] ?? { fixable_qty: 0, unfixable_qty: 0 };
      const other = field === 'fixable_qty' ? cur.unfixable_qty : cur.fixable_qty;
      const current = cur[field];
      const next = current > 0 ? 0 : Math.max(0, total - other);
      return { ...prev, [idx]: { ...cur, [field]: next } };
    });
  };

  const handleUseData = async () => {
    if (!result) return;
    const s = calcSummary(result.items ?? [], itemClass);
    const enriched = {
      ...result,
      fixable_count:   s.fixableQty,
      unfixable_count: s.unfixableQty,
    };

    // Build per-product qty maps for save-inventory-tx
    const fixable_qty_map: Record<string, number> = {};
    const unfixable_qty_map: Record<string, number> = {};
    (result.items ?? []).forEach((item, idx) => {
      const c = itemClass[idx];
      if (c?.fixable_qty)   fixable_qty_map[item.product_name]   = c.fixable_qty;
      if (c?.unfixable_qty) unfixable_qty_map[item.product_name] = c.unfixable_qty;
    });

    setIsSaving(true);
    // Wait for save-inventory-tx to apply stock updates and resolve marketplace_returns
    try {
      const { error } = await supabase.functions.invoke('save-inventory-tx', {
        body: {
          scan_result: enriched,
          classification: enriched.classification,
          fixable_qty_map,
          unfixable_qty_map,
          nakladnoy_id: currentNakladnoyId,
        },
      });
      if (error) {
        console.error('[save-inventory-tx]', error.message);
        toast.error('Zaxirani yangilashda xatolik yuz berdi: ' + error.message);
      } else {
        toast.success(`Tovarlar omborga muvaffaqiyatli qo'shildi!`);
      }
    } finally {
      setIsSaving(false);
      onResult(enriched, files[0]);
      handleClose();
    }
  };

  const summary = result?.items ? calcSummary(result.items, itemClass) : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!max-w-none w-[calc(100vw-220px)] h-[630px] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Vozvrat hujjatini skanerlash
          </DialogTitle>
          <DialogDescription>
            PDF, Word, Excel yoki rasm faylini yuklang — AI avtomatik ma'lumotlarni chiqaradi
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Drop Zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
            )}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXT} className="hidden"
              onChange={e => { if (e.target.files) handleFilesAdded(e.target.files); e.target.value = ''; }} />
            <Upload className="h-9 w-9 mx-auto mb-3 text-muted-foreground/60" />
            <p className="font-medium text-foreground">Fayllarni bu yerga tashlang yoki bosing</p>
            <p className="text-sm text-muted-foreground mt-1">PDF · DOCX · XLSX · PNG · JPG — maksimal 10MB</p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Tanlangan fayllar ({files.length})</p>
              <div className="space-y-1.5">
                {files.map(f => {
                  const badge = fileTypeBadge(f.type);
                  return (
                    <div key={f.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 border border-border">
                      <FileTypeIcon mimeType={f.type} className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm truncate">{f.name}</span>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border shrink-0', badge.cls)}>{badge.label}</Badge>
                      <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                      <button type="button" onClick={e => { e.stopPropagation(); removeFile(f.name); }}
                        className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scanning */}
          {isScanning && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">AI tahlil qilmoqda...</p>
                <p className="text-xs text-muted-foreground">{progress || 'Yuklanmoqda...'}</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Xatolik yuz berdi</p>
                <p className="text-xs mt-0.5 opacity-80">{error}</p>
              </div>
            </div>
          )}

          {/* ── Result ── */}
          {result && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              {/* Result header */}
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                <p className="font-semibold">Ma'lumotlar chiqarildi</p>
                {/* Auto-save status */}
                {isSaving && (
                  <span className="flex items-center gap-1 text-xs text-primary ml-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saqlanmoqda...
                  </span>
                )}
                {!isSaving && savedCount !== null && (
                  <span className="flex items-center gap-1 text-xs text-green-600 ml-1">
                    <Save className="h-3 w-3" /> {savedCount} ta saqlandi ✓
                  </span>
                )}
                <span className={cn(
                  'ml-auto text-xs px-2 py-0.5 rounded-full font-medium',
                  result.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                )}>{result.status || 'success'}</span>
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground"
                  onClick={() => { reset(); setFiles([]); setSavedCount(null); }}>
                  <RotateCcw className="h-3 w-3" /> Qayta
                </Button>
              </div>

              {/* Document meta */}
              <div className="space-y-2">
                {/* Row 1: core doc info */}
                <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-background border border-border">
                  {[
                    { label: 'Hujjat raqami', value: result.document?.document_number },
                    { label: 'Hujjat turi',   value: result.classification?.document_type || result.document?.document_type },
                    { label: 'Sana',           value: result.document?.date },
                    { label: 'Hamkor',         value: result.document?.partner },
                  ].map(({ label, value }, i) => (
                    <div key={i}>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">{label}</p>
                      <p className="text-sm font-semibold truncate">{value || '—'}</p>
                    </div>
                  ))}
                </div>

                {/* Row 2: extended info (only if available) */}
                {(result.classification || result.document?.warehouse_from || result.document?.warehouse_to || result.fraud_analysis) && (
                  <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-background border border-border">
                    {[
                      { label: 'Platform',    value: result.classification?.platform },
                      { label: 'Model',       value: result.classification?.logistics_model },
                      { label: 'Ombordan',    value: result.document?.warehouse_from },
                      { label: 'Omborgacha',  value: result.document?.warehouse_to },
                    ].map(({ label, value }, i) => (
                      <div key={i}>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">{label}</p>
                        <p className="text-sm font-semibold truncate">{value || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fraud risk badge */}
                {result.fraud_analysis && (
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border',
                    result.fraud_analysis.risk_level === 'low'    && 'bg-green-500/10 border-green-500/20 text-green-700',
                    result.fraud_analysis.risk_level === 'medium' && 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700',
                    result.fraud_analysis.risk_level === 'high'   && 'bg-red-500/10 border-red-500/20 text-red-700',
                  )}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Fraud riski: <strong>{result.fraud_analysis.risk_level.toUpperCase()}</strong></span>
                    {result.fraud_analysis.issues?.length > 0 && (
                      <span className="opacity-70">· {result.fraud_analysis.issues.join(' | ')}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Items table with inline classification */}
              {result.items && result.items.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  {/* ── Live 3-category summary bar ── */}
                  <div className="flex items-center border-b border-border">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-green-500/10 border-r border-border">
                      <Wrench className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span className="text-xs text-green-700 font-medium">Bo'ladi:</span>
                      <span className="text-sm font-bold text-green-600 ml-auto">{summary?.fixableQty ?? 0}</span>
                      {(summary?.fixableTotal ?? 0) > 0 && (
                        <span className="text-[11px] text-green-600">· {fmt(summary!.fixableTotal)}</span>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border-r border-border">
                      <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      <span className="text-xs text-red-700 font-medium">Bo'lmaydi:</span>
                      <span className="text-sm font-bold text-red-600 ml-auto">{summary?.unfixableQty ?? 0}</span>
                      {(summary?.unfixableTotal ?? 0) > 0 && (
                        <span className="text-[11px] text-red-600">· {fmt(summary!.unfixableTotal)}</span>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-muted/30">
                      <CheckCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground font-medium">Normal:</span>
                      <span className="text-sm font-bold text-foreground ml-auto">{summary?.normalQty ?? result.items.reduce((s,i) => s+i.quantity,0)}</span>
                    </div>
                  </div>

                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-8" />
                      <col />
                      <col className="w-16" />
                      <col className="w-28" />
                      <col className="w-28" />
                      <col className="w-10" />
                    </colgroup>
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Mahsulot</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Miqdor</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Narx</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Jami</th>
                        <th className="text-center px-2 py-2.5 text-xs font-medium text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((item, idx) => {
                        const cls = itemClass[idx];
                        const fq = cls?.fixable_qty ?? 0;
                        const uq = cls?.unfixable_qty ?? 0;
                        const nq = Math.max(0, item.quantity - fq - uq);
                        const isOpen = expandedRow === idx;
                        const hasClass = fq > 0 || uq > 0;

                        return (
                          <>
                            {/* Main row */}
                            <tr
                              key={`row-${idx}`}
                              className={cn(
                                'border-t border-border transition-colors',
                                hasClass && fq > 0 && uq > 0 && 'bg-yellow-500/5',
                                hasClass && fq > 0 && uq === 0 && 'bg-green-500/5',
                                hasClass && uq > 0 && fq === 0 && 'bg-red-500/5',
                                isOpen && 'bg-muted/30',
                              )}
                            >
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                              <td className="px-3 py-2.5 truncate max-w-0" title={item.product_name}>
                                <div className="flex items-center gap-1">
                                  {fq > 0 && <Wrench className="h-3 w-3 text-green-500 shrink-0" />}
                                  {uq > 0 && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                                  <span className="truncate">{item.product_name || '—'}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right">{item.quantity}</td>
                              <td className="px-3 py-2.5 text-right">{fmt(item.unit_price)}</td>
                              <td className="px-3 py-2.5 text-right font-semibold">{fmt(item.total_price)}</td>
                              <td className="px-2 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandedRow(isOpen ? null : idx)}
                                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded tri-state classification */}
                            {isOpen && (
                              <tr key={`expand-${idx}`} className="border-t border-border/50">
                                <td colSpan={6} className="px-4 py-3 bg-muted/10">
                                  <div className="space-y-2">
                                    {/* Row 1: fixable */}
                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => toggleField(idx, 'fixable_qty', item.quantity)}
                                        className={cn(
                                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all w-44 shrink-0',
                                          fq > 0
                                            ? 'bg-green-500 text-white border-green-500'
                                            : 'border-border text-muted-foreground hover:border-green-400 hover:text-green-600 bg-background',
                                        )}
                                      >
                                        <Wrench className="h-3.5 w-3.5" /> Tuzatib bo'ladi
                                      </button>
                                      {/* Qty stepper */}
                                      <div className="flex items-center gap-1 border border-border rounded-lg bg-background overflow-hidden">
                                        <button type="button" className="px-2 py-1 text-sm hover:bg-muted transition-colors"
                                          onClick={() => setClassQty(idx, 'fixable_qty', fq - 1, item.quantity)}>−</button>
                                        <input type="number" min={0} max={item.quantity - uq}
                                          value={fq}
                                          onChange={e => setClassQty(idx, 'fixable_qty', parseInt(e.target.value)||0, item.quantity)}
                                          className="w-12 text-center text-sm bg-transparent outline-none py-1" />
                                        <button type="button" className="px-2 py-1 text-sm hover:bg-muted transition-colors"
                                          onClick={() => setClassQty(idx, 'fixable_qty', fq + 1, item.quantity)}>+</button>
                                      </div>
                                      <span className="text-xs text-muted-foreground">/ {item.quantity}</span>
                                      {fq > 0 && <span className="text-xs font-semibold text-green-600 ml-1">= {fmt(fq * item.unit_price)}</span>}
                                    </div>

                                    {/* Row 2: unfixable */}
                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => toggleField(idx, 'unfixable_qty', item.quantity)}
                                        className={cn(
                                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all w-44 shrink-0',
                                          uq > 0
                                            ? 'bg-red-500 text-white border-red-500'
                                            : 'border-border text-muted-foreground hover:border-red-400 hover:text-red-600 bg-background',
                                        )}
                                      >
                                        <XCircle className="h-3.5 w-3.5" /> Tuzatib bo'lmaydi
                                      </button>
                                      <div className="flex items-center gap-1 border border-border rounded-lg bg-background overflow-hidden">
                                        <button type="button" className="px-2 py-1 text-sm hover:bg-muted transition-colors"
                                          onClick={() => setClassQty(idx, 'unfixable_qty', uq - 1, item.quantity)}>−</button>
                                        <input type="number" min={0} max={item.quantity - fq}
                                          value={uq}
                                          onChange={e => setClassQty(idx, 'unfixable_qty', parseInt(e.target.value)||0, item.quantity)}
                                          className="w-12 text-center text-sm bg-transparent outline-none py-1" />
                                        <button type="button" className="px-2 py-1 text-sm hover:bg-muted transition-colors"
                                          onClick={() => setClassQty(idx, 'unfixable_qty', uq + 1, item.quantity)}>+</button>
                                      </div>
                                      <span className="text-xs text-muted-foreground">/ {item.quantity}</span>
                                      {uq > 0 && <span className="text-xs font-semibold text-red-600 ml-1">= {fmt(uq * item.unit_price)}</span>}
                                    </div>

                                    {/* Normal (auto) */}
                                    <div className="flex items-center gap-3 opacity-60">
                                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background w-44 shrink-0">
                                        <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" /> Normal
                                      </div>
                                      <span className="text-sm font-semibold text-foreground">{nq}</span>
                                      <span className="text-xs text-muted-foreground">ta (avtomatik)</span>
                                      {nq > 0 && <span className="text-xs font-semibold text-foreground ml-1">= {fmt(nq * item.unit_price)}</span>}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>

                    {/* Footer — tri-state summary rows */}
                    <tfoot className="bg-muted/50 border-t-2 border-border">
                      {summary && summary.fixableQty > 0 && (
                        <tr className="border-t border-green-500/20 bg-green-500/5">
                          <td colSpan={2} className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Wrench className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-xs font-medium text-green-700">Tuzatib bo'ladi</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-green-700">{summary.fixableQty}</td>
                          <td />
                          <td className="px-3 py-2 text-right text-xs font-bold text-green-700" colSpan={2}>{fmt(summary.fixableTotal)}</td>
                        </tr>
                      )}
                      {summary && summary.unfixableQty > 0 && (
                        <tr className="border-t border-red-500/20 bg-red-500/5">
                          <td colSpan={2} className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                              <span className="text-xs font-medium text-red-700">Tuzatib bo'lmaydi</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-red-700">{summary.unfixableQty}</td>
                          <td />
                          <td className="px-3 py-2 text-right text-xs font-bold text-red-700" colSpan={2}>{fmt(summary.unfixableTotal)}</td>
                        </tr>
                      )}
                      {summary && summary.normalQty > 0 && (
                        <tr className="border-t border-border/40 bg-muted/30">
                          <td colSpan={2} className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">Normal</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{summary.normalQty}</td>
                          <td />
                          <td className="px-3 py-2 text-right text-xs font-bold text-muted-foreground" colSpan={2}>{fmt(summary.normalTotal)}</td>
                        </tr>
                      )}
                      <tr className="border-t border-border">
                        <td colSpan={2} className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <span className="font-semibold">Umumiy jami</span>
                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                              {result.total_items} ta
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {result.items.reduce((s, i) => s + i.quantity, 0)}
                        </td>
                        <td />
                        <td className="px-3 py-3 text-right" colSpan={2}>
                          <span className="text-base font-bold text-primary">{fmt(result.total_value)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Warnings */}
              {result.errors && result.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs space-y-1">
                  {result.errors.map((e, i) => <p key={i}>⚠ {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
          <Button variant="outline" onClick={handleClose}>Bekor qilish</Button>
          <Button onClick={handleUseData} disabled={!result || isScanning} className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Bu ma'lumotlardan foydalanish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
