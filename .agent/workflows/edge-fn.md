---
description: Create, debug, and manage Supabase Edge Functions
---

# /edge-fn — Supabase Edge Functions Workflow

Manage the 59+ Edge Functions in alicargo-joy-main.

## Function Directory Structure
```
supabase/functions/
  uzum-orders/index.ts         ← Uzum Market orders sync
  yandex-orders/index.ts       ← Yandex Market orders sync
  ali-ai-brain/index.ts        ← Main AI brain function
  telegram-bot/index.ts        ← Telegram notifications
  exchange-rates/index.ts      ← Currency rate fetcher
  save-inventory-tx/index.ts   ← Inventory transaction saver
  scan-return-document/index.ts← PDF return scanner
  ... (59 total functions)
```

## Create a New Edge Function

### Step 1: Create the folder and index.ts
```typescript
// supabase/functions/my-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    
    // Your logic here
    const result = { success: true };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

## Deploy Edge Functions
```bash
# Deploy single function
npx supabase functions deploy my-function

# Deploy all at once
.\deploy-all-functions.ps1

# Deploy specific marketplace functions
npx supabase functions deploy uzum-orders
npx supabase functions deploy yandex-orders
npx supabase functions deploy uzum-stocks
```

## Call Edge Function from React
```typescript
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { param1: 'value1' },
});
```

## Debug Edge Functions
```bash
# View real-time logs
npx supabase functions logs my-function --tail

# Test locally
npx supabase functions serve my-function
curl -X POST http://localhost:54321/functions/v1/my-function \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"test": true}'
```

## Key Function Groups in This Project

| Group | Functions | Purpose |
|---|---|---|
| Uzum | `uzum-orders`, `uzum-stocks`, `uzum-finance`, `uzum-returns`, `uzum-products` | Uzum Market sync |
| Yandex | `yandex-orders`, `yandex-stocks`, `yandex-finance`, `yandex-returns` | Yandex Market sync |
| Ali AI | `ali-ai-brain`, `ai-analytics`, `ai-chat-assistant`, `ai-financial-analysis` | AI features |
| Telegram | `telegram-bot`, `send-telegram-alert`, `set-telegram-webhook` | Notifications |
| Finance | `exchange-rates`, `daily-finance-summary`, `sync-marketplace-finance` | Financial calcs |
| Inventory | `save-inventory-tx`, `tashkent-stock-sync`, `process-stock-queue` | Stock management |

## Usage
```
/edge-fn "create new function for Wildberries orders sync"
/edge-fn "debug why ali-ai-brain is returning 500"
/edge-fn "deploy all marketplace functions"
```
