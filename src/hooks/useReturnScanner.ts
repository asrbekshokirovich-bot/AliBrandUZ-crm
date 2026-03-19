import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

export interface FinancialItem {
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface FinancialDocument {
  document_type: string;
  document_number: string;
  date: string;
  partner: string;
  warehouse_from?: string;
  warehouse_to?: string;
  currency?: string;
}

export interface Classification {
  platform: string;
  logistics_model: string;
  document_type: string;
}

export interface InventoryEntry {
  location: string;
  product_name: string;
  quantity: number;
}

export interface InventoryEffect {
  deductions: InventoryEntry[];
  additions: InventoryEntry[];
}

export interface FraudAnalysis {
  risk_level: 'low' | 'medium' | 'high';
  issues: string[];
}

export interface ScanResult {
  // Legacy fields (backward compat)
  product_name: string;
  order_id: string;
  price: string;
  reason_for_return: string;
  date: string;
  // Core
  status: string;
  document_type: string;
  partner: string;
  document: FinancialDocument;
  classification?: Classification;
  items: FinancialItem[];
  inventory_effect?: InventoryEffect;
  summary?: { total_items: number; total_value: number };
  fraud_analysis?: FraudAnalysis;
  total_items: number;
  total_value: number;
  errors: string[];
  warnings?: string[];
  // Classification counts set by dialog
  fixable_count?: number;
  unfixable_count?: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/webp': 'image',
};

// ── File readers ──────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** DOCX: ZIP byte-level extraction of word/document.xml */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await fileToArrayBuffer(file);
  const uint8 = new Uint8Array(arrayBuffer);
  const target = new TextEncoder().encode('word/document.xml');

  for (let i = 0; i < uint8.length - 30; i++) {
    if (uint8[i] === 0x50 && uint8[i + 1] === 0x4b && uint8[i + 2] === 0x03 && uint8[i + 3] === 0x04) {
      const fnLen = uint8[i + 26] | (uint8[i + 27] << 8);
      const extraLen = uint8[i + 28] | (uint8[i + 29] << 8);
      if (fnLen !== target.length) continue;
      const fn = uint8.slice(i + 30, i + 30 + fnLen);
      if (target.every((b, idx) => fn[idx] === b)) {
        const dataStart = i + 30 + fnLen + extraLen;
        const chunk = uint8.slice(dataStart, dataStart + 500000);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(chunk);
        const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        return matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Fallback: whole-file text strip
  const full = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
  return full.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
}

async function extractXlsxText(file: File): Promise<string> {
  const ab = await fileToArrayBuffer(file);
  const wb = XLSX.read(ab, { type: 'array' });
  return wb.SheetNames.slice(0, 3)
    .map(n => `[${n}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`)
    .join('\n\n')
    .slice(0, 12000);
}

// ── Edge function caller (raw fetch — avoids Supabase JS client routing issues) ──

// scan-return-document is deployed on AliBrandUZ project
const SCAN_FUNCTION_URL = 'https://tcozucevusrecxmfyigl.supabase.co/functions/v1/scan-return-document';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function callScanFunction(body: Record<string, string>): Promise<ScanResult | null> {
  const url = `${SCAN_FUNCTION_URL}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => resp.statusText);
    throw new Error(`Edge function xatosi (${resp.status}): ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();

  if (data.status === 'error' || !data.success) {
    throw new Error(data.errors?.[0] || data.error || 'AI xatolik qaytardi');
  }

  const doc: FinancialDocument = data.document || {};
  const items: FinancialItem[] = Array.isArray(data.items) ? data.items : [];
  const summary = data.summary || {};

  // Map new schema → ScanResult (backward compat + new fields)
  return {
    // Legacy
    product_name: items[0]?.product_name || '',
    order_id: doc.document_number || '',
    price: String(summary.total_value ?? items[0]?.total_price ?? ''),
    reason_for_return: doc.document_type || '',
    date: doc.date || '',
    // New
    status: data.status || 'success',
    document_type: doc.document_type || '',
    partner: doc.partner || '',
    document: {
      document_type: doc.document_type || '',
      document_number: doc.document_number || '',
      date: doc.date || '',
      partner: doc.partner || '',
    },
    items,
    total_items: summary.total_items ?? items.length,
    total_value: summary.total_value ?? 0,
    errors: data.errors || [],
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const EMPTY: ScanResult = {
  product_name: '', order_id: '', price: '', reason_for_return: '', date: '',
  status: 'success', document_type: '', partner: '',
  document: { document_type: '', document_number: '', date: '', partner: '' },
  items: [], total_items: 0, total_value: 0, errors: [],
};

export function useReturnScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  const reset = useCallback(() => { setResult(null); setError(null); setProgress(''); }, []);

  const scanFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setIsScanning(true);
    setError(null);
    setResult(null);

    try {
      let gotResult = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`${i + 1}/${files.length}: ${file.name}`);

        if (file.size > MAX_FILE_SIZE) throw new Error(`Fayl hajmi 10MB dan oshmasligi kerak: ${file.name}`);

        const category = ACCEPTED_TYPES[file.type];
        if (!category) throw new Error(`Qo'llab-quvvatlanmaydigan fayl turi: ${file.name}`);

        let body: Record<string, string>;

        if (category === 'image') {
          setProgress('Rasm skanlanmoqda…');
          body = { imageBase64: await fileToBase64(file), mimeType: file.type };
        } else if (category === 'pdf') {
          setProgress('PDF yuborilmoqda…');
          body = { imageBase64: await fileToBase64(file), mimeType: 'application/pdf' };
        } else if (category === 'docx') {
          setProgress('Word hujjati o\'qilmoqda…');
          const text = await extractDocxText(file);
          if (!text.trim()) throw new Error(`${file.name} faylidan matn chiqarib bo'lmadi`);
          body = { text, mimeType: file.type };
        } else {
          setProgress('Excel fayli o\'qilmoqda…');
          const text = await extractXlsxText(file);
          if (!text.trim()) throw new Error(`${file.name} faylidan ma'lumot chiqarib bo'lmadi`);
          body = { text, mimeType: file.type };
        }

        setProgress('AI tahlil qilmoqda…');
        const scanResult = await callScanFunction(body);
        if (!scanResult) continue;
        setResult(scanResult);
        gotResult = true;
        break;
      }

      if (!gotResult) {
        setError("Hujjatdan ma'lumot topilmadi. Fayl sifatini tekshiring.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Noma'lum xatolik");
    } finally {
      setIsScanning(false);
      setProgress('');
    }
  }, []);

  return { scanFiles, isScanning, result, error, progress, reset, ACCEPTED_TYPES };
}
