---
description: Parse and process PDF documents - nakladnoys, invoices, and returns
---

# /pdf — PDF Parsing and Processing Workflow

Handle PDF parsing for nakladnoys, invoices, and return documents.

## Parser Architecture
```
src/lib/pdfInvoiceParser.ts    ← Main parser (Uzum nakladnoy PDF)
src/hooks/useReturnScanner.ts  ← Return document scanner hook
supabase/functions/
  scan-return-document/        ← AI-powered return scanner
```

## How pdfInvoiceParser Works
```typescript
import { parsePdfText, parseInvoiceData } from '@/lib/pdfInvoiceParser';

// Step 1: Extract text from PDF
const text = await parsePdfText(file);

// Step 2: Parse structured data
const parsed = parseInvoiceData(text);
// Returns: ParsedInvoice {
//   invoiceNumber, invoiceDate, senderName, pickupPoint,
//   acceptedOrders: string[],
//   notAcceptedOrders: string[],
//   isProductReceipt: boolean,
//   productItems: { artikul: string, quantity: number }[]
// }
```

## Add New PDF Parser for a Format
```typescript
// In pdfInvoiceParser.ts, add a new parser function:
export function parseYandexInvoice(text: string): ParsedInvoice {
  // Match Yandex-specific patterns
  const invoiceNumber = text.match(/Накладная №(\d+)/)?.[1] ?? null;
  const orders = [...text.matchAll(/UID:\s*(\d+)/g)].map(m => m[1]);
  
  return {
    invoiceNumber,
    invoiceDate: null,
    senderName: null,
    pickupPoint: null,
    acceptedOrders: orders,
    notAcceptedOrders: [],
    isProductReceipt: false,
    productItems: [],
  };
}
```

## AI-Powered PDF Parsing (via Gemini)
```typescript
// For complex PDFs, use the AI scanner Edge Function
const { data } = await supabase.functions.invoke('scan-return-document', {
  body: { fileBase64: btoa(await file.arrayBuffer()), mimeType: file.type },
});
```

## Debug PDF Parsing
```typescript
// Log full PDF text to see what you're working with
const text = await parsePdfText(file);
console.log('[PDF TEXT FULL]:', text);  // Check actual patterns

// Test regex patterns
const pattern = /Накладная №(\d+)/;
console.log('[Regex test]:', pattern.test(text), pattern.exec(text));
```

## Supported PDF Types in This Project

| Type | Parser | Marketplace |
|---|---|---|
| Handover nakladnoy | `parseInvoiceData()` | Uzum |
| Product receipt (Приём товаров) | `parseInvoiceData()` isProductReceipt=true | Uzum |
| Return document | `useReturnScanner` / AI | All |
| Supply invoice | SupplyInvoicesTab | All |
| Yandex supply request | yandex-supply-requests fn | Yandex |

## PDF.js Setup (if needed)
```typescript
// Uses pdfjs-dist under the hood
// Already configured in the project
import { getDocument } from 'pdfjs-dist';
```

## Usage
```
/pdf "add parser for Wildberries return document format"
/pdf "debug why Yandex nakladnoy invoice number isn't being extracted"
/pdf "improve Uzum SKU matching accuracy"
```
