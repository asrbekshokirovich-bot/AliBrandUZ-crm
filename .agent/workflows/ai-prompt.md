---
description: Create and improve Ali AI prompts for better Uzbek responses and analytics
---

# /ai-prompt — Ali AI Prompt Engineering Workflow

Improve Ali AI Brain prompts in alicargo-joy-main for better Uzbek-language business analytics.

## Ali AI Architecture
```
src/pages/crm/AliAIBrain.tsx     ← UI component
api/ceo-ai.ts                     ← Vercel Edge Function (main AI endpoint)
api/ai-analytics.ts               ← Analytics AI endpoint
src/hooks/useAIAnalytics.ts       ← React hook for AI calls
supabase/functions/*/index.ts     ← Supabase Edge Functions (if used)
```

## System Prompt Principles

### 1. Always respond in Uzbek
```typescript
const systemPrompt = `
Sen AliBrand kompaniyasining AI yordamchisisisan (Ali AI).
MUHIM: Har doim O'zbek tilida javob ber.
Raqamlarni aniq va to'g'ri hisoblashni ta'minla.
`;
```

### 2. Finance Calculation — Proportional Weight Formula
```typescript
// All cost calculations use this formula:
const landedCostPerItem = (
  (item.unit_cost_usd * exchangeRate) +
  (totalShippingCost * (item.weight / totalWeight)) +
  packagingFee
);
```

### 3. CEO-Level Analytics Prompts
```typescript
// Bugungi statistika
"Bugun qancha tovar sotildi, qancha daromad olindi, qaysi kategoriya eng ko'p sotildi?"

// Muammolar
"Qaysi buyurtmalar kechikmoqda? Zaxirada kamligi bor mahsulotlar?"

// Prognoz
"Keyingi 7 kunda qancha tovar kelib tushadi? Yetkazib berish grafigi?"
```

## Improving AI Response Quality

### Step 1: Check current prompt
```bash
# Find prompts in api/ceo-ai.ts
grep -n "systemPrompt\|prompt\|SYSTEM" api/ceo-ai.ts
```

### Step 2: Add more context data
```typescript
// Include real DB data in the prompt
const context = `
Ma'lumotlar (${new Date().toLocaleDateString('uz-UZ')}):
- Bugungi savdo: ${todaySales} ta tovar, ${salesAmount} UZS
- Kutilayotgan yetkazib berish: ${inTransitCount} ta qutilar
- Zaxirada: ${totalStock} ta tovar
`;
```

### Step 3: Test AI responses
```typescript
// Test via Supabase Edge Function Logs or Vercel Logs
// Check: is it answering in Uzbek? Are numbers correct?
```

## Common AI Issues

| Problem | Fix |
|---|---|
| AI responds in Russian | Add "Faqat O'zbek tilida javob ber" to system prompt |
| Wrong currency conversion | Pass current UZS/USD rate from DB |
| Generic answers | Add specific DB data to context |
| Slow response | Reduce context size, use streaming |

## Usage
```
/ai-prompt "improve CEO daily analytics response"
/ai-prompt "add inventory shortage detection to AI"
```
