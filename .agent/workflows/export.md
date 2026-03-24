---
description: Export data to Excel/CSV, generate reports, and create printable documents
---

# /export — Data Export and Reporting Workflow

Export CRM data to Excel, CSV, PDF reports for alicargo-joy-main.

## Excel/CSV Export Pattern
```typescript
import * as XLSX from 'xlsx';

// Export boxes to Excel
function exportBoxesToExcel(boxes: Box[]) {
  const worksheet = XLSX.utils.json_to_sheet(boxes.map(box => ({
    'Qutilar raqami': box.box_number,
    'Status': box.status,
    'Joy': box.location,
    'Sana': format(new Date(box.created_at), 'dd.MM.yyyy'),
    'Tovarlar soni': box.product_items?.length ?? 0,
  })));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Qutilar');
  XLSX.writeFile(workbook, `qutilar_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

// Add export button to component
<Button onClick={() => exportBoxesToExcel(boxes)} variant="outline">
  <Download className="h-4 w-4 mr-2" />
  Excel yuklash
</Button>
```

## CSV Export (lightweight)
```typescript
function exportToCSV(data: any[], filename: string) {
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  const csv = [headers, ...rows].join('\n');
  
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}
```

## Print/PDF via Browser
```typescript
// Trigger browser print (CSS @media print controls layout)
function printReport() {
  window.print();
}

// Or use jsPDF for programmatic PDF
import jsPDF from 'jspdf';
const doc = new jsPDF();
doc.text('AliBrand Hisobot', 10, 10);
doc.save('hisobot.pdf');
```

## Nakladnoy/Invoice PDF Template
```typescript
// For proper Arabic/Cyrillic/Latin nakladnoys
// Use the existing pdfInvoiceParser.ts for reading
// Use jsPDF + custom fonts for generation
```

## Common Export Types in This Project

| Export | Data Source | Format |
|---|---|---|
| Qutilar ro'yxati | `boxes` table | Excel |
| Savdo tarixi | `direct_sales` | Excel/CSV |
| Nakladnoylar | `handover_invoices` | PDF |
| Tovarlar inventariyasi | `products` + `product_items` | Excel |
| Marketplace buyurtmalari | `marketplace_orders` | CSV |
| Moliyaviy hisobot | Multiple tables | PDF |

## Install xlsx Package (if not installed)
```bash
npm install xlsx
```

## Usage
```
/export "add Excel export button to Boxes page"
/export "create monthly sales report PDF"
/export "export marketplace orders to CSV"
```
