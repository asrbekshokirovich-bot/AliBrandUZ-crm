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

// Yandex: "Akt priema-peredachi Tovara" parser

function parseYandexAct(text: string): ParsedInvoice {
  const invMatch =
    text.match(/[Aa]\u043a\u0442[\s\S]{0,40}[\u2116#]\s*(\d+)/i) ||
    text.match(/\u0410\u041f\u041f\s*[\u2116#]?\s*(\d+)/i) ||
    text.match(/[\u2116#]\s*(\d{7,})/);
  const invoiceNumber = invMatch ? invMatch[1] : '';

  const senderMatch =
    text.match(/[\u041e\u043e]\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u0435\u043b\u044c\s*:?\s*(.+?)(?:\s{4,}|\d{1,2}\s*[^\w]\s*|\n)/u) ||
    text.match(/[\u0417\u0437]\u0430\u043a\u0430\u0437\u0447\u0438\u043a\s*:?\s*(.+?)(?:\n|$)/u);
  const senderName = (senderMatch?.[1] || '').replace(/\s+/g, ' ').trim();

  const MONTHS: Record<string, string> = {
    '\u044f\u043d\u0432\u0430\u0440\u044f':'01','\u0444\u0435\u0432\u0440\u0430\u043b\u044f':'02','\u043c\u0430\u0440\u0442\u0430':'03','\u0430\u043f\u0440\u0435\u043b\u044f':'04',
    '\u043c\u0430\u044f':'05','\u0438\u044e\u043d\u044f':'06','\u0438\u044e\u043b\u044f':'07','\u0430\u0432\u0433\u0443\u0441\u0442\u0430':'08',
    '\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f':'09','\u043e\u043a\u0442\u044f\u0431\u0440\u044f':'10','\u043d\u043e\u044f\u0431\u0440\u044f':'11','\u0434\u0435\u043a\u0430\u0431\u0440\u044f':'12',
  };
  const wordDateMatch = text.match(/(\d{1,2})\s*[^\w\s]\s*([^\d\s]+)\s+(\d{4})/u);
  const numDateMatch  = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  let invoiceDate = '';
  if (wordDateMatch) {
    const m = MONTHS[wordDateMatch[2].toLowerCase()] || '01';
    invoiceDate = `${wordDateMatch[1].padStart(2,'0')}.${m}.${wordDateMatch[3]}`;
  } else if (numDateMatch) {
    invoiceDate = `${numDateMatch[1]}.${numDateMatch[2]}.${numDateMatch[3]}`;
  }

  const productItems: ParsedInvoice['productItems'] = [];
  const seen = new Set<string>();

  const rowRegex =
    /\b\d{1,3}\s+([A-Za-z][a-zA-Z0-9\-.]{1,40})\s+([\s\S]*?)\s+(\d{1,5})\s+(\d[\d\s]{2,11})\s+(\d[\d\s]{2,11})(?=\s+\d{1,3}\s+[A-Za-z]|\s*(?:\u0418\u0442\u043e\u0433\u043e|\u0412\u0441\u0435\u0433\u043e|\u0410\u041f\u041f|$))/g;

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

  if (productItems.length === 0) {
    const SKIP = /^(SKU|OOO|UB|Market|Yandex|MARKET|Internet|Tashkent|Almazar)$/i;
    const slugRegex = /([A-Za-z][a-zA-Z0-9\-.]{2,35})\s+([\u0400-\u04FF][^\d\n]{5,80}?)\s+(\d{1,4})\s+(\d{4,12})\s+(\d{4,12})/g;
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
    invoiceNumber, senderName, pickupPoint: '', invoiceDate,
    acceptedOrders: [], notAcceptedOrders: [],
    isProductReceipt: true, isYandexMarket: true, productItems,
  };
}

// Universal entry point

export function parseInvoiceData(text: string): ParsedInvoice {
  // Auto-detect Yandex market documents
  const isYandex =
    /Market\s*Yandex|Yandex\s*Go|YGO\s*UB/i.test(text) ||
    /\u0410\u043a\u0442\s+\u043f\u0440\u0438\u0435\u043c\u0430-\u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0438\s+\u0422\u043e\u0432\u0430\u0440\u0430/i.test(text);

  if (isYandex) return parseYandexAct(text);

  // Uzum / standard nakladnoy parser
  let normalizedText = text;
  normalizedText = normalizedText.replace(/A\s+S\s+L/gi, 'ASL');
  normalizedText = normalizedText.replace(
    /ASL((?:\s*[\w\u0400-\u04FF-])+)/gi,
    (m) => m.replace(/\s+/g, '')
  );
  const workingText = /ASL[\w\u0400-\u04FF]{3,}/i.test(normalizedText) ? normalizedText : text;

  // Debug: log first 1500 chars of raw PDF text
  console.log('[PDF Parser] Raw text (first 1500):\n', workingText.substring(0, 1500));

  // Invoice number: 11 fallback patterns, multiline-safe with [\s\S]
  const first2k = workingText.substring(0, 2000);
  let invoiceNumber = '';
  const invPatterns: RegExp[] = [
    /[\u041d\u043d]\u0430\u043a\u043b\u0430\u0434\u043d\u0430\u044f[\s\S]{0,200}?[\u2116#]\s*(\d{4,})/i,
    /[\u041f\u043f]\u0440\u0438[\u0435\u0451]\u043c\s+\u0442\u043e\u0432\u0430\u0440\u043e\u0432[\s\S]{0,200}?[\u2116#]\s*(\d{4,})/i,
    /(?:FBS|\u0424\u0411\u0421)[\s\S]{0,100}?[\u2116#]\s*(\d{4,})/i,
    /\u043f\u0435\u0440\u0435\u0434\u0430\u0447[\u0443\u0438][\s\S]{0,200}?[\u2116#]\s*(\d{4,})/i,
    /[\u0410\u0430]\u043a\u0442[\s\S]{0,100}?[\u2116#]\s*(\d{4,})/i,
    /[\u0417\u0437]\u0430\u0434\u0430\u043d\u0438\u0435[\s\S]{0,100}?[\u2116#]\s*(\d{4,})/i,
    /[\u0421\u0441]\u043f\u0438\u0441\u043e\u043a[\s\S]{0,100}?[\u2116#]\s*(\d{4,})/i,
    /[\u041d\u043d]\u0430\u043a\u043b\u0430\u0434\u043d\u0430\u044f\s+(\d{6,})/i,
    /(?:FBS|\u0424\u0411\u0421)\s+(\d{6,})/i,
    /[\u2116#]\s*(\d{6,})/,
    /[\u2116#]\s*(\d{4,})/,
  ];
  for (const pat of invPatterns) {
    const m = first2k.match(pat) ?? workingText.match(pat);
    if (m?.[1]) { invoiceNumber = m[1]; break; }
  }

  // Sender name: 7 fallback patterns
  let senderName = '';
  const senderPatterns: RegExp[] = [
    /[\u041e\u043e]\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u0435\u043b\u044c\s*:?\s*(.+?)(?:\s+[\u2116#]|\s+\u0434\u043e\u0433\u043e\u0432\u043e\u0440|\s+[\u041f\u043f]\u0443\u043d\u043a\u0442|\n|$)/i,
    /[\u041f\u043f]\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a\s*:?\s*(.+?)(?:\n|$)/i,
    /[\u041f\u043f]\u0430\u0440\u0442\u043d\u0435\u0440\s*:?\s*(.+?)(?:\n|$)/i,
    /[\u041a\u043a]\u043e\u043c\u0438\u0441\u0441\u0438\u043e\u043d\u0435\u0440\s*:?\s*(.+?)(?:[\u041f\u043f]\u0440\u0438\u043d\u044f\u0442\u044b\u0435|\s{5,}|\n|$)/i,
    /[\u0417\u0437]\u0430\u043a\u0430\u0437\u0447\u0438\u043a\s*:?\s*(.+?)(?:\n|$)/i,
    /[\u041f\u043f]\u0440\u043e\u0434\u0430\u0432\u0435\u0446\s*:?\s*(.+?)(?:\n|$)/i,
    /(?:\u0418\u041f|\u041e\u041e\u041e|\u0427\u041f|\u0410\u041e|\u0418\u0423\u041f\u041f|\u0418\u0423\u041f)\s+(["«]?[\u0400-\u04FF\u0041-\u005A][\u0400-\u04FF\u0041-\u005Aa-z\u0430-\u04FF\s]{5,60}["»]?)/u,
  ];
  for (const pat of senderPatterns) {
    const m = first2k.match(pat) ?? workingText.match(pat);
    const raw = (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (raw && raw.length > 2) { senderName = raw; break; }
  }

  // Date
  const dateMatch = workingText.match(/(\d{2}\.\d{2}\.\d{4})/);
  const invoiceDate = dateMatch ? dateMatch[1] : '';

  // Pickup point: 5 fallback patterns
  let pickupPoint = '';
  const pickupPatterns: RegExp[] = [
    /[\u041f\u043f]\u0443\u043d\u043a\u0442\s+(?:\u043f\u0440\u0438\u0435\u043c\u0430|\u0432\u044b\u0434\u0430\u0447\u0438|\u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0438|\u0432\u044b\u0432\u043e\u0437\u0430)\s*:?\s*(.+?)(?:\s{3,}|\n|$)/i,
    /[\u0410\u0430]\u0434\u0440\u0435\u0441\s*(?:\u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438|\u0441\u0434\u0430\u0447\u0438|\u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0438|\u043f\u0443\u043d\u043a\u0442\u0430|\u0441\u043a\u043b\u0430\u0434\u0430)?\s*:?\s*(.+?)(?:\n|$)/i,
    /[\u041c\u043c]\u0435\u0441\u0442\u043e\s+(?:\u043f\u0440\u0438\u0435\u043c\u0430|\u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0438|\u0432\u044b\u0434\u0430\u0447\u0438)\s*:?\s*(.+?)(?:\n|$)/i,
    /[\u0421\u0441]\u043a\u043b\u0430\u0434\s*(?:\u043f\u0440\u0438\u0435\u043c\u0430)?\s*:?\s*(.+?)(?:\n|$)/i,
    /(?:\u0433\.|[\u0413\u0433]\u043e\u0440\u043e\u0434|\u0443\u043b\.|\u0448\u043e\u0441\u0441\u0435|\u043f\u0440\.)\s+([\u0400-\u04FFa-zA-Z][^\n]{5,80})/iu,
  ];
  for (const pat of pickupPatterns) {
    const m = workingText.match(pat);
    const raw = (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (raw && raw.length > 3) { pickupPoint = raw; break; }
  }

  console.log('[PDF Parser] Extracted fields:', { invoiceNumber, senderName, invoiceDate, pickupPoint });

  const isProductReceipt = /\u043f\u0440\u0438[\u0435\u0451]\u043c\s*\u0442\u043e\u0432\u0430\u0440\u043e\u0432/i.test(workingText)
    || (/ASL[\w\u0400-\u04FF][\w\u0400-\u04FF\d-]*/i.test(workingText) && /\d+\s*\u0448\u0442/i.test(workingText));

  if (isProductReceipt) {
    const artikulRegex = /ASL[\w\u0400-\u04FF][\w\u0400-\u04FF\d-]*/gi;
    const artikulMatches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = artikulRegex.exec(workingText)) !== null) {
      artikulMatches.push(m[0].replace(/\s+/g, '').toUpperCase());
    }

    const qtyRegex = /(\d+)\s*\u0448\u0442/gi;
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

    console.log('[Product Receipt] items:', productItems);
    return { invoiceNumber, senderName, pickupPoint, invoiceDate,
             acceptedOrders: [], notAcceptedOrders: [], isProductReceipt, productItems };
  }

  const notAcceptedSplit = workingText.split(/\u041d\u0435\s*\u043f\u0440\u0438\u043d\u044f\u0442\u044b\u0435\s*\u0437\u0430\u043a\u0430\u0437\u044b/i);
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
  const contractMatch = workingText.match(/\u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0430\s*:?\s*(\d{5,})/i);
  const innMatch = workingText.match(/\u0418\u041d\u041d\s*:?\s*(\d{5,})/i);
  const pinfMatch = workingText.match(/\u041f\u0418\u041d\u0424\u041b\s*:?\s*(\d{5,})/i);
  const okedMatch = workingText.match(/\u041e\u041a\u042d\u0414\s*:?\s*(\d{4,})/i);
  const phoneMatches = workingText.match(/\+?\d{10,}/g) || [];

  const headerBoundary = Math.max(0, workingText.toLowerCase().indexOf('\u043f\u0440\u0438\u043d\u044f\u0442\u044b\u0435 \u0437\u0430\u043a\u0430\u0437\u044b'));
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
    ...headerNumbers,
  ]);
  const acceptedOrders = extractOrders(acceptedSection).filter(o => !filterOut.has(o.orderNumber));
  const notAcceptedOrders = extractOrders(notAcceptedSection).filter(o => !filterOut.has(o.orderNumber));

  return { invoiceNumber, senderName, pickupPoint, invoiceDate, acceptedOrders, notAcceptedOrders, isProductReceipt: false, productItems: [] };
}
