import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  Trash2,
  RotateCcw,
  FileSearch,
  ImageOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface DocumentItem {
  num: number;
  sku: string;
  name: string;
  barcode: string | null;
  price: number;
  qty: number;
  total: number;
  // Admin sets this:
  repair_status?: 'repairable' | 'irreparable' | null;
  classified_qty?: number | null; // how many of this item's qty are in that status
}

interface DocumentInfo {
  doc_number: string;
  date: string;
  client_name: string;
  client_phone: string;
  contract_number: string;
  commissioner: string;
}

interface AnalysisResult {
  is_readable: boolean;
  clarity_score: number;
  clarity_issues?: string;
  document_info: DocumentInfo | null;
  items: DocumentItem[];
  grand_total_qty: number | null;
  grand_total_sum: number | null;
}

type ScanStep = 'idle' | 'uploading' | 'analyzing' | 'done' | 'blurry' | 'error';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ReturnDocumentScanner({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ScanStep>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Qty-input dialog state
  const [qtyDialog, setQtyDialog] = useState<{
    itemIndex: number;
    status: 'repairable' | 'irreparable';
    maxQty: number;
    inputValue: string;
  } | null>(null);

  const reset = () => {
    setStep('idle');
    setResult(null);
    setItems([]);
    setPreviewUrl(null);
    setQtyDialog(null);
    setUploadedFile(null);
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1];
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Call OpenAI GPT-4o Vision API directly (no edge function needed)
  const analyzeWithGemini = async (imageBase64: string, mimeType: string) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

    const PROMPT = `You are analyzing a Russian "Возврат товаров комитенту" (product return) document image.

TASK: Extract ALL data from this document table and return ONLY valid JSON, no other text.

The document has these columns:
- № (row number)
- Описание товара / SKU товара (product name/description + SKU code)
- Штрих-код (barcode)
- Закупочная цена (purchase price, number)
- Кол-во (quantity, number)
- Сумма (total amount = price × qty)

Also find header info: document number, date, client name, phone, contract number, commissioner name.

Return this exact JSON structure:
{
  "clarity_score": 0.85,
  "is_readable": true,
  "document_info": {
    "doc_number": "6640907",
    "date": "09.02.2026",
    "client_name": "Yunusova Umida Anvarovna",
    "client_phone": "998977472336",
    "contract_number": "0326698н",
    "commissioner": "ИП ООО UZUM MARKET"
  },
  "items": [
    {"num": 1, "sku": "ABDU98-ATR-АМЕТИС", "name": "Atir uchun flakon sprey 5ml Аметис", "barcode": "1000055280762", "price": 9900, "qty": 2, "total": 19800},
    {"num": 2, "sku": "SKU-CODE-HERE", "name": "Product name here", "barcode": null, "price": 5000, "qty": 1, "total": 5000}
  ],
  "grand_total_qty": 233,
  "grand_total_sum": 14845200
}

IMPORTANT RULES:
- Extract EVERY row from the table, do not skip any
- If clarity_score < 0.6, set is_readable to false
- Return ONLY the JSON object, no markdown, no explanation
- All numbers must be actual numbers (not strings)
- SKU is the product code (артикул), name is the full description`;

    // OpenAI GPT-4o Vision API
    const extractResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
          ],
        }],
        max_tokens: 4096,
        temperature: 0.05,
      }),
    });

    if (!extractResp.ok) {
      const errText = await extractResp.text();
      throw new Error(`OpenAI API xatosi: ${extractResp.status} - ${errText.slice(0, 300)}`);
    }

    const ed = await extractResp.json();
    const ec = ed.choices?.[0]?.message?.content || '{}';

    // Parse JSON from response
    let result: any = { clarity_score: 0.8, is_readable: true, document_info: null, items: [] };
    try {
      const cleaned = ec.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) result = JSON.parse(m[0]);
    } catch (e) {
      console.error('JSON parse error:', e, 'Raw response:', ec.slice(0, 500));
    }

    if (!result.is_readable || result.clarity_score < 0.55) {
      return { success: true, is_readable: false,
        clarity_score: result.clarity_score || 0.5,
        clarity_issues: "Hujjat xira yoki o'qish qiyin",
        items: [], document_info: null, grand_total_qty: null, grand_total_sum: null };
    }

    return {
      success: true, is_readable: true,
      clarity_score: result.clarity_score || 0.8,
      document_info: result.document_info || null,
      items: result.items || [],
      grand_total_qty: result.grand_total_qty || null,
      grand_total_sum: result.grand_total_sum || null,
    };
  };


  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setUploadedFile(file);
    setStep('analyzing');

    try {
      const imageBase64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';

      const data = await analyzeWithGemini(imageBase64, mimeType);

      setResult(data);

      if (!data.is_readable) {
        setStep('blurry');
        return;
      }

      // Initialize items with null repair_status
      const initialItems: DocumentItem[] = (data.items || []).map((item: DocumentItem) => ({
        ...item,
        repair_status: null,
      }));
      setItems(initialItems);
      setStep('done');
    } catch (err: any) {
      console.error('Document analysis error:', err);
      toast.error('Hujjatni tahlil qilishda xato: ' + (err.message || 'Noma\'lum xato'));
      setStep('error');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Opens qty-input dialog when admin picks a status
  const openQtyDialog = (index: number, status: 'repairable' | 'irreparable') => {
    const item = items[index];
    setQtyDialog({
      itemIndex: index,
      status,
      maxQty: Number(item.qty) || 1,
      inputValue: String(Number(item.qty) || 1),
    });
  };

  // Confirm qty and apply status
  const confirmQtyDialog = () => {
    if (!qtyDialog) return;
    const qty = Math.min(Math.max(1, Number(qtyDialog.inputValue) || 1), qtyDialog.maxQty);
    setItems((prev) =>
      prev.map((item, i) =>
        i === qtyDialog.itemIndex
          ? { ...item, repair_status: qtyDialog.status, classified_qty: qty }
          : item
      )
    );
    setQtyDialog(null);
  };


  const handleSave = async () => {
    if (!result?.document_info) return;
    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const docInfo = result.document_info;
      const nakladnoyId = `doc-${docInfo.doc_number}-${docInfo.date}`;

      // Upload document image to Supabase Storage
      let docImageUrl: string | null = null;
      if (uploadedFile) {
        const ext = uploadedFile.name.split('.').pop() || 'jpg';
        const storagePath = `return-docs/${nakladnoyId}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('return-documents')
          .upload(storagePath, uploadedFile, { upsert: true, contentType: uploadedFile.type });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from('return-documents')
            .getPublicUrl(storagePath);
          docImageUrl = urlData?.publicUrl ?? null;
        }
      }

      const rows = items.map((item) => ({
        external_order_id: `return-doc-${docInfo.doc_number}-sku-${item.sku}-${item.num}`,
        store_name: docInfo.commissioner || 'Noma\'lum',
        platform: 'manual',
        product_title: item.name,
        sku_title: item.sku,
        quantity: item.qty,
        amount: Number(item.price) * Number(item.qty),
        currency: 'UZS',
        return_type: 'fbs_seller',
        return_date: docInfo.date ? new Date(docInfo.date).toISOString() : now,
        nakladnoy_id: nakladnoyId,
        resolution: item.repair_status === 'repairable'
          ? 'return_to_stock'
          : item.repair_status === 'irreparable'
          ? 'remove_from_stock'
          : 'normal',
        resolution_note: item.repair_status === 'repairable'
          ? '✅ Tuzatsa bo\'ladi'
          : item.repair_status === 'irreparable'
          ? '❌ Tuzatib bo\'lmaydi'
          : '🟢 Yaxshi holat (tasnifsiz)',
        resolved_by: user?.id,
        resolved_at: now,
        image_url: docImageUrl,
      }));

      // Step 1: delete all rows for this document (by nakladnoy_id)
      await supabase
        .from('marketplace_returns')
        .delete()
        .eq('nakladnoy_id', nakladnoyId);

      // Step 2: also delete by exact external_order_ids as safety net
      const externalIds = rows.map((r) => r.external_order_id);
      await supabase
        .from('marketplace_returns')
        .delete()
        .in('external_order_id', externalIds);

      // Step 3: insert fresh rows
      const { error } = await supabase
        .from('marketplace_returns')
        .insert(rows);

      if (error) throw error;

      toast.success(`${rows.length} ta tovar muvaffaqiyatli saqlandi`);
      onSaved?.();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error('Saqlashda xato: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const markedCount      = items.filter((i) => i.repair_status !== null).length;
  const unmarkedCount    = items.filter((i) => i.repair_status === null).length;

  const repairableItems  = items.filter((i) => i.repair_status === 'repairable');
  const irreparableItems = items.filter((i) => i.repair_status === 'irreparable');

  const repairableCount  = repairableItems.length;
  const irreparableCount = irreparableItems.length;

  const repairableQty    = repairableItems.reduce((s, i) => s + (Number(i.classified_qty ?? i.qty) || 0), 0);
  const irreparableQty   = irreparableItems.reduce((s, i) => s + (Number(i.classified_qty ?? i.qty) || 0), 0);

  const repairableSum    = repairableItems.reduce((s, i) => {
    const usedQty = Number(i.classified_qty ?? i.qty) || 0;
    const unitPrice = usedQty > 0 && i.qty > 0 ? (Number(i.total) / i.qty) : 0;
    return s + unitPrice * usedQty;
  }, 0);
  const irreparableSum   = irreparableItems.reduce((s, i) => {
    const usedQty = Number(i.classified_qty ?? i.qty) || 0;
    const unitPrice = usedQty > 0 && i.qty > 0 ? (Number(i.total) / i.qty) : 0;
    return s + unitPrice * usedQty;
  }, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent
          className="flex flex-col overflow-hidden transition-all duration-300 p-0"
          style={step === 'done'
            ? { width: 'min(1100px, 90vw)', maxWidth: 'min(1100px, 90vw)', height: 'min(619px, 85vh)' }
            : { maxWidth: '448px' }
          }
        >

          {/* Fixed header */}
          <div className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5 text-primary" />
                Vozvrat Hujjatini Skanerlash
              </DialogTitle>
              <DialogDescription>
                "Возврат товаров комитенту" hujjatini yuklang — AI tovarlarni avtomatik ajratadi
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

          {/* ─── IDLE / Upload Zone ─── */}
          {(step === 'idle' || step === 'error') && (
            <div
              className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-200 group"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Hujjat rasmini yuklang</p>
                  <p className="text-sm text-muted-foreground mt-1">JPG, PNG yoki WebP format • Bosing yoki tashlang</p>
                </div>
                {step === 'error' && (
                  <Badge variant="destructive" className="mt-1">Xato yuz berdi — qayta urinib ko'ring</Badge>
                )}
              </div>
            </div>
          )}

          {/* ─── Analyzing ─── */}
          {step === 'analyzing' && (
            <div className="rounded-xl border bg-card p-8 text-center space-y-4">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Hujjat"
                  className="max-h-48 mx-auto rounded-lg object-contain border shadow-sm"
                />
              )}
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="font-medium text-foreground">AI hujjatni tahlil qilmoqda...</p>
                <p className="text-sm text-muted-foreground">Birinchi aniqlik tekshiriladi, keyin tovarlar ajratiladi</p>
              </div>
            </div>
          )}

          {/* ─── Blurry Warning ─── */}
          {step === 'blurry' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-6 space-y-4">
              {previewUrl && (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Hujjat (xira)"
                    className="max-h-40 mx-auto rounded-lg object-contain border shadow-sm blur-[1px] opacity-70"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ImageOff className="h-12 w-12 text-amber-500 drop-shadow" />
                  </div>
                </div>
              )}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    Hujjat yaxshi ko'rinmayapti
                  </p>
                </div>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {result?.clarity_issues || 'Aniqlik darajasi: ' + Math.round((result?.clarity_score || 0) * 100) + '%'}
                </p>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Iltimos, hujjatni tiniqroq qilib qayta yuklang
                </p>
              </div>
              <div className="flex justify-center">
                <Button onClick={reset} variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Qayta yuklash
                </Button>
              </div>
            </div>
          )}

          {/* ─── Done: Items Table ─── */}
          {step === 'done' && result && (
            <div className="space-y-4">
              {/* Document Info Banner */}
              {result.document_info && (
                <div className="rounded-lg border bg-muted/40 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Hujjat №:</span>
                    <span className="font-mono font-bold ml-1">{result.document_info.doc_number}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sana:</span>
                    <span className="font-medium ml-1">{result.document_info.date}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mijoz:</span>
                    <span className="font-medium ml-1 truncate">{result.document_info.client_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Shartnoma:</span>
                    <span className="font-mono ml-1">{result.document_info.contract_number}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Komissioner:</span>
                    <span className="font-medium ml-1">{result.document_info.commissioner}</span>
                  </div>
                </div>
              )}

              {/* Clarity Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Hujjat aniq ({Math.round(result.clarity_score * 100)}%)
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {items.length} ta tovar topildi
                </Badge>
                {markedCount > 0 && (
                  <>
                    <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 border-emerald-200">
                      <Wrench className="h-3.5 w-3.5" />
                      {repairableCount} ta tuzatiladi
                    </Badge>
                    <Badge className="gap-1 bg-destructive/10 text-destructive border-destructive/20">
                      <Trash2 className="h-3.5 w-3.5" />
                      {irreparableCount} ta tuzatib bo'lmaydi
                    </Badge>
                  </>
                )}
              </div>

              {/* ── Classification Summary Panel ── */}
              {items.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {/* Fixable */}
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <Wrench className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">✅ Fixable</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                        <span>Product types</span>
                        <span className="font-bold text-base text-emerald-800 dark:text-emerald-200">{repairableCount}</span>
                      </div>
                      <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                        <span>Total qty</span>
                        <span className="font-semibold">{repairableQty} pcs</span>
                      </div>
                      <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                        <span>Total amount</span>
                        <span className="font-semibold">{repairableSum.toLocaleString()} UZS</span>
                      </div>
                    </div>
                  </div>

                  {/* Non-fixable */}
                  <div className="rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-red-600" />
                      </div>
                      <span className="font-semibold text-red-800 dark:text-red-300 text-sm">❌ Non-fixable</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-red-700 dark:text-red-400">
                        <span>Product types</span>
                        <span className="font-bold text-base text-red-800 dark:text-red-200">{irreparableCount}</span>
                      </div>
                      <div className="flex justify-between text-xs text-red-700 dark:text-red-400">
                        <span>Total qty</span>
                        <span className="font-semibold">{irreparableQty} pcs</span>
                      </div>
                      <div className="flex justify-between text-xs text-red-700 dark:text-red-400">
                        <span>Total amount</span>
                        <span className="font-semibold">{irreparableSum.toLocaleString()} UZS</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Items Table */}
              <div className="rounded-xl border">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground text-xs">
                      <th className="text-left p-3 w-8">№</th>
                      <th className="text-left p-3 w-[15%]">SKU</th>
                      <th className="text-left p-3">Nomi</th>
                      <th className="text-right p-3 w-[11%]">Narxi</th>
                      <th className="text-right p-3 w-[6%]">Soni</th>
                      <th className="text-right p-3 w-[10%]">Jami</th>
                      <th className="text-center p-3 w-[22%]">Holat belgilash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`border-b last:border-0 transition-colors ${
                          item.repair_status === 'repairable'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/10'
                            : item.repair_status === 'irreparable'
                            ? 'bg-red-50/50 dark:bg-red-950/10'
                            : ''
                        }`}
                      >
                        <td className="p-3 text-muted-foreground font-mono text-xs">{item.num}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground min-w-[140px]">
                          {item.sku}
                        </td>
                        <td className="p-3 font-medium min-w-[240px]">
                          <span>{item.name}</span>
                        </td>
                        <td className="p-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {Number(item.price).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-bold text-foreground">{item.qty}</td>
                        <td className="p-3 text-right font-medium whitespace-nowrap">
                          {(Number(item.price) * Number(item.qty)).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <Select
                            value={item.repair_status || ''}
                            onValueChange={(val) =>
                              openQtyDialog(idx, val as 'repairable' | 'irreparable')
                            }
                          >
                            <SelectTrigger
                              className={`h-8 text-xs w-full ${
                                item.repair_status === 'repairable'
                                  ? 'border-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
                                  : item.repair_status === 'irreparable'
                                  ? 'border-destructive text-destructive bg-red-50 dark:bg-red-950/30'
                                  : 'border-dashed'
                              }`}
                            >
                              <SelectValue placeholder="Holat tanlang..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="repairable">
                                <span className="flex items-center gap-2 text-emerald-700">
                                  <Wrench className="h-3.5 w-3.5" />
                                  ✅ Tuzatsa bo'ladi
                                </span>
                              </SelectItem>
                              <SelectItem value="irreparable">
                                <span className="flex items-center gap-2 text-destructive">
                                  <XCircle className="h-3.5 w-3.5" />
                                  ❌ Tuzatib bo'lmaydi
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {item.repair_status && item.classified_qty != null && (
                            <p className={`text-[10px] mt-1 text-center font-medium ${
                              item.repair_status === 'repairable' ? 'text-emerald-600' : 'text-red-500'
                            }`}>
                              {item.classified_qty} / {item.qty} pcs
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-bold text-sm border-t-2">
                      <td colSpan={4} className="p-3 text-right text-muted-foreground">
                        Jami:
                      </td>
                      <td className="p-3 text-right">
                        {items.reduce((s, i) => s + Number(i.qty), 0)} dona
                      </td>
                      <td className="p-3 text-right whitespace-nowrap text-primary">
                        {items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0).toLocaleString()} UZS
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          </div>{/* end scrollable body */}

          {/* Sticky action footer — only shown in done state */}
          {step === 'done' && result && (
            <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between gap-3 bg-background">
              <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
                <RotateCcw className="h-4 w-4 mr-2" />
                Boshidan boshlash
              </Button>
              <div className="flex items-center gap-2">
                {markedCount < items.length && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {items.length - markedCount} ta tovar belgilanmagan
                  </span>
                )}
                <Button
                  onClick={handleSave}
                  disabled={isSaving || items.length === 0}
                  className="bg-primary text-primary-foreground"
                >
                  {isSaving ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saqlanmoqda...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" />{items.length} ta tovarni saqlash</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    {/* ── Qty-Input Popup ── */}
    <Dialog open={!!qtyDialog} onOpenChange={(v) => { if (!v) setQtyDialog(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {qtyDialog?.status === 'repairable'
              ? <><Wrench className="h-4 w-4 text-emerald-600" /> How many are fixable?</>
              : <><XCircle className="h-4 w-4 text-red-500" /> How many are non-fixable?</>
            }
          </DialogTitle>
          <DialogDescription className="text-xs">
            Item has <strong>{qtyDialog?.maxQty}</strong> pcs total. Enter the count that falls into this category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground flex-1">Quantity:</span>
            <div className="flex items-center gap-2">
              <button
                className="w-8 h-8 rounded-full border hover:bg-muted transition-colors font-bold text-lg flex items-center justify-center"
                onClick={() => setQtyDialog((d) => d ? { ...d, inputValue: String(Math.max(1, Number(d.inputValue) - 1)) } : d)}
              >−</button>
              <input
                type="number"
                min={1}
                max={qtyDialog?.maxQty}
                value={qtyDialog?.inputValue ?? ''}
                onChange={(e) => setQtyDialog((d) => d ? { ...d, inputValue: e.target.value } : d)}
                className="w-20 text-center border rounded-lg p-2 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white text-gray-900"
              />
              <button
                className="w-8 h-8 rounded-full border hover:bg-muted transition-colors font-bold text-lg flex items-center justify-center"
                onClick={() => setQtyDialog((d) => d ? { ...d, inputValue: String(Math.min(d.maxQty, Number(d.inputValue) + 1)) } : d)}
              >+</button>
            </div>
            <span className="text-sm text-muted-foreground">/ {qtyDialog?.maxQty}</span>
          </div>

          <div className={`rounded-lg p-2 text-xs text-center font-medium ${
            qtyDialog?.status === 'repairable'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {qtyDialog?.status === 'repairable' ? '✅ Fixable' : '❌ Non-fixable'}: {qtyDialog?.inputValue || 0} pcs
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setQtyDialog(null)}>
              Cancel
            </Button>
            <Button
              className={`flex-1 ${qtyDialog?.status === 'repairable' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} text-white`}
              onClick={confirmQtyDialog}
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
