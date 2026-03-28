export interface ParsedOrder {
  orderNumber: string;
  barcode: string;
}

export interface ParsedInvoice {
  invoiceNumber: string;
  senderName: string;
  pickupPoint: string;
  invoiceDate: string;
  acceptedOrders: ParsedOrder[];
  notAcceptedOrders: ParsedOrder[];
  isProductReceipt: boolean;
  isYandexMarket?: boolean;
  productItems: Array<{ artikul: string; quantity: number; name: string; unitPrice?: number; totalPrice?: number }>;
}

export async function parsePdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
}

// ─── Yandex: "Акт приема-передачи Товара" parser ────────────────────────────

function parseYandexAct(text: string): ParsedInvoice {
  // Invoice number: "Акт приема-передачи Товара №0000036668" or "АПП №XXXXX"
  const invMatch =
    text.match(/[Аа]кт[^№\n]{0,40}[№#]\s*(\d+)/i) ||
    text.match(/АПП\s*[№#]?\s*(\d+)/i) ||
    text.match(/[№#]\s*(\d{7,})/);
  const invoiceNumber = invMatch ? invMatch[1] : '';

  // Sender: "Отправитель:" or "Заказчик:"
  const senderMatch =
    text.match(/[Оо]тправитель\s*:?\s*(.+?)(?:\s{4,}|\d{1,2}\s*[•·▪]\s*|\n)/u) ||
    text.match(/[Зз]аказчик\s*:?\s*(.+?)(?:\n|$)/u);
  const senderName = (senderMatch?.[1] || '').replace(/\s+/g, ' ').trim();

  // Date: "24 • января 2026г" OR "DD.MM.YYYY"
  const MONTHS: Record<string, string> = {
    '\u044f\u043d\u0432\u0430\u0440\u044f':'01','\u0444\u0435\u0432\u0440\u0430\u043b\u044f':'02','\u043c\u0430\u0440\u0442\u0430':'03','\u0430\u043f\u0440\u0435\u043b\u044f':'04',
    '\u043c\u0430\u044f':'05','\u0438\u044e\u043d\u044f':'06','\u0438\u044e\u043b\u044f':'07','\u0430\u0432\u0433\u0443\u0441\u0442\u0430':'08',
    '\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f':'09','\u043e\u043a\u0442\u044f\u0431\u0440\u044f':'10','\u043d\u043e\u044f\u0431\u0440\u044f':'11','\u0434\u0435\u043a\u0430\u0431\u0440\u044f':'12',
  };
  const wordDateMatch = text.match(/(\d{1,2})\s*[•·▪\s]\s*([а-яёА-ЯЁ]+)\s+(\d{4})/iu);
  const numDateMatch  = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  let invoiceDate = '';
  if (wordDateMatch) {
    const m = MONTHS[wordDateMatch[2].toLowerCase()] || '01';
    invoiceDate = `${wordDateMatch[1].padStart(2,'0')}.${m}.${wordDateMatch[3]}`;
  } else if (numDateMatch) {
    invoiceDate = `${numDateMatch[1]}.${numDateMatch[2]}.${numDateMatch[3]}`;
  }

  // ── Table rows ──
  // Each row: <rowNum> <SKU> <Product name in Russian> <qty> <unitPrice> <totalPrice>
  // SKU: starts with letter, contains letters/digits/hyphens/dots (no spaces)
  const productItems: ParsedInvoice['productItems'] = [];
  const seen = new Set<string>();

  // Primary: row-number based regex
  const rowRegex =
    /\b\d{1,3}\s+([A-Za-z][a-zA-Z0-9\-.]{1,40})\s+([\s\S]*?)\s+(\d{1,5})\s+(\d[\d\s]{2,11})\s+(\d[\d\s]{2,11})(?=\s+\d{1,3}\s+[A-Za-z]|\s*(?:Итого|Всего|ИТОГО|АПП|$))/g;

  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(text)) !== null) {
    const sku       = match[1].trim();
    const name      = match[2].replace(/\s+/g, ' ').trim();
    const qty       = parseInt(match[3], 10);
    const unitPrice = parseInt(match[4].replace(/\s/g, ''), 10) || 0;
    const totalPrice= parseInt(match[5].replace(/\s/g, ''), 10) || 0;

    if (qty > 0 && sku.length >= 2 && !seen.has(sku)) {
      seen.add(sku);
      productItems.push({ artikul: sku, name, quantity: qty, unitPrice, totalPrice });
    }
  }

  // Fallback: simpler slug + Cyrillic + numbers
  if (productItems.length === 0) {
    const slugRegex = /([A-Za-z][a-zA-Z0-9\-.]{2,35})\s+([А-ЯЁа-яёA-Za-z][^\d\n]{5,80}?)\s+(\d{1,4})\s+(\d{4,12})\s+(\d{4,12})/g;
    const SKIP = /^(SKU|OOO|UB|Market|Yandex|MARKET|Internet|Tashkent|Almazar)$/i;
    while ((match = slugRegex.exec(text)) !== null) {
      const sku = match[1].trim();
      if (SKIP.test(sku) || seen.has(sku)) continue;
      const name = match[2].replace(/\s+/g, ' ').trim();
      const qty  = parseInt(match[3], 10);
      const unitPrice  = parseInt(match[4], 10);
      const totalPrice = parseInt(match[5], 10);
      if (qty > 0 && qty <= 9999 && sku.length >= 2) {
        seen.add(sku);
        productItems.push({ artikul: sku, name, quantity: qty, unitPrice, totalPrice });
      }
    }
  }

  return {
    invoiceNumber,
    senderName,
    pickupPoint: '',
    invoiceDate,
    acceptedOrders: [],
    notAcceptedOrders: [],
    isProductReceipt: true,
    isYandexMarket: true,
    productItems,
  };
}

// ─── Universal entry point ───────────────────────────────────────────────────

export function parseInvoiceData(text: string): ParsedInvoice {
  // Auto-detect Yandex market documents
  const isYandex =
    /Market\s*Yandex|Yandex\s*Go|YGO\s*UB/i.test(text) ||
    /[Аа]кт\s+приема-передачи\s+[Тт]овара/i.test(text);

  if (isYandex) return parseYandexAct(text);

  // ─── Uzum / standard nakladnoy parser (original) ─────────────────────────
  let normalizedText = text;
  normalizedText = normalizedText.replace(/A\s+S\s+L/gi, 'ASL');
  normalizedText = normalizedText.replace(
    /ASL((?:\s*[\w\u0400-\u04FF-])+)/gi,
    (match) => match.replace(/\s+/g, '')
  );
  const workingText = /ASL[\w\u0400-\u04FF]{3,}/i.test(normalizedText) ? normalizedText : text;

  const invoiceMatch = 
    workingText.match(/[Нн]акладная\s+.*?[№#]\s*(\d+)/i) ||
    workingText.match(/[Пп]ри[её]м\s+товаров\s+[№#]\s*(\d+)/i) ||
    workingText.match(/FBS\s+заказов\s+[№#]?\s*(\d+)/i) ||
    workingText.match(/передач[уи]\s+.*?[№#]\s*(\d+)/i) ||
    workingText.match(/[№#]\s*(\d{4,})/);
  const invoiceNumber = invoiceMatch ? invoiceMatch[1] : '';
  
  const senderMatch = 
    workingText.match(/[Оо]тправитель\s*:?\s*(.+?)(?:\s+[№#]|\s+договор|\s+Пункт|\n|$)/i);
  const senderName = senderMatch ? senderMatch[1].trim() : '';
  
  const dateMatch = workingText.match(/(\d{2}\.\d{2}\.\d{4})/);
  const invoiceDate = dateMatch ? dateMatch[1] : '';
  
  const pickupMatch = 
    workingText.match(/[Пп]ункт\s+приема\s*:?\s*(.+?)(?:\s{3,}|\n|$)/i);
  const pickupPoint = pickupMatch ? pickupMatch[1].trim() : '';

  const isProductReceipt = /при[её]м\s*товаров/i.test(workingText) 
    || (/ASL[\w\u0400-\u04FF][\w\u0400-\u04FF\d-]*/i.test(workingText) && /\d+\s*шт/i.test(workingText));

  if (isProductReceipt) {
    const artikulRegex = /ASL[\w\u0400-\u04FF][\w\u0400-\u04FF\d-]*/gi;
    const artikulMatches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = artikulRegex.exec(workingText)) !== null) {
      artikulMatches.push(m[0].replace(/\s+/g, '').toUpperCase());
    }

    const qtyRegex = /(\d+)\s*шт/gi;
    const qtyMatches: number[] = [];
    while ((m = qtyRegex.exec(workingText)) !== null) {
      const qty = parseInt(m[1], 10);
      if (qty > 0) qtyMatches.push(qty);
    }

    if (qtyMatches.length > artikulMatches.length) {
      const totalCandidate = qtyMatches[qtyMatches.length - 1];
      const sumWithout = qtyMatches.slice(0, -1).reduce((s, q) => s + q, 0);
      if (totalCandidate === sumWithout) qtyMatches.pop();
    }

    const productItems: ParsedInvoice['productItems'] = [];
    const count = Math.min(artikulMatches.length, qtyMatches.length);
    for (let i = 0; i < count; i++) {
      productItems.push({ artikul: artikulMatches[i], quantity: qtyMatches[i], name: artikulMatches[i] });
    }

    console.log('[Product Receipt] Extracted artikuls:', artikulMatches);
    console.log('[Product Receipt] Extracted quantities:', qtyMatches);
    console.log('[Product Receipt] Paired items:', productItems);

    return { invoiceNumber, senderName, pickupPoint, invoiceDate, 
             acceptedOrders: [], notAcceptedOrders: [], isProductReceipt, productItems };
  }
  
  const notAcceptedSplit = workingText.split(/Не\s*принятые\s*заказы/i);
  const acceptedSection = notAcceptedSplit[0] || '';
  const notAcceptedSection = notAcceptedSplit[1] || '';
  
  const extractOrders = (section: string): ParsedOrder[] => {
    const cleanedSection = section.replace(/\d{2}-\d{8,12}-\d+/g, '');
    const matches = cleanedSection.match(/\b(\d{7,10})\b/g);
    const uniqueOrders = matches ? [...new Set(matches)] : [];
    return uniqueOrders.map(order => {
      const regexStr = `\\d{2}-${order.padStart(10, '0')}-\\d+`;
      const barcodeMatch = section.match(new RegExp(regexStr, 'i'));
      const synthesizedBarcode = `10-${order.padStart(10, '0')}-1`;
      return { orderNumber: order, barcode: barcodeMatch ? barcodeMatch[0] : synthesizedBarcode };
    });
  };
  
  const dateDigits = (invoiceDate.match(/\d+/g) || []);
  const contractMatch = workingText.match(/договора\s*:?\s*(\d{5,})/i);
  const innMatch = workingText.match(/ИНН\s*:?\s*(\d{5,})/i);
  const pinfMatch = workingText.match(/ПИНФЛ\s*:?\s*(\d{5,})/i);
  const okedMatch = workingText.match(/ОКЭД\s*:?\s*(\d{4,})/i);
  const phoneMatches = workingText.match(/\+?\d{10,}/g) || [];
  
  const headerBoundary = Math.max(0, workingText.toLowerCase().indexOf('принятые заказы'));
  const headerText = headerBoundary > 0 ? workingText.slice(0, headerBoundary) : '';
  const headerNumbers = headerText.match(/\d{5,}/g) || [];
  
  const filterOut = new Set([
    invoiceNumber,
    ...dateDigits,
    ...(contractMatch ? [contractMatch[1]] : []),
    ...(innMatch ? [innMatch[1]] : []),
    ...(pinfMatch ? [pinfMatch[1]] : []),
    ...(okedMatch ? [okedMatch[1]] : []),
    ...phoneMatches.map(p => p.replace(/\D/g, '')),
    '309376127',
    ...headerNumbers
  ]);
  const acceptedOrders = extractOrders(acceptedSection).filter(o => !filterOut.has(o.orderNumber));
  const notAcceptedOrders = extractOrders(notAcceptedSection).filter(o => !filterOut.has(o.orderNumber));
  
  return { invoiceNumber, senderName, pickupPoint, invoiceDate, acceptedOrders, notAcceptedOrders, isProductReceipt: false, productItems: [] };
}
