---
description: Manage Telegram bot notifications, alerts, and webhook setup
---

# /telegram — Telegram Bot Workflow

Manage the AliBrand Telegram bot for notifications and alerts.

## Architecture
```
supabase/functions/telegram-bot/index.ts       ← Main bot handler
supabase/functions/send-telegram-alert/index.ts ← Send alert utility
supabase/functions/set-telegram-webhook/index.ts ← Webhook setup
```

## Setup Webhook
```bash
# Deploy the webhook setter function
npx supabase functions deploy set-telegram-webhook

# Call it to register with Telegram
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/set-telegram-webhook \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Send Alert from Code
```typescript
// From any Edge Function or API route
const response = await fetch(
  `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-telegram-alert`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `📦 Yangi qutilar keldi: ${boxCount} ta\n🏪 ${warehouseName}`,
      chat_id: ADMIN_CHAT_ID, // optional, defaults to channel
    }),
  }
);
```

## Message Templates
```typescript
// Box arrived notification
const boxAlert = `
📦 *Qutilar keldi!*
🔢 Qutilar: #${box.box_number}
📍 Joylashuv: Toshkent Ombori
⏰ Vaqt: ${format(new Date(), 'dd.MM.yyyy HH:mm')}
`;

// Low stock alert
const stockAlert = `
⚠️ *Zaxira kam!*
🏷️ Tovar: ${product.name}
📊 Qolgan: ${stock} dona
🔗 CRM: https://alibrand.uz/crm
`;

// Daily summary
const dailySummary = `
📊 *Kunlik hisobot - ${format(new Date(), 'dd.MM.yyyy')}*
💰 Sotuv: ${sales} UZS
📦 Yetkazib berildi: ${delivered} ta
🚚 Yo'lda: ${inTransit} ta
`;
```

## Environment Variables
```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_CHAT_ID=-1001234567890  # Group/channel ID
TELEGRAM_ALERT_CHANNEL_ID=-1001234567890
```

## Common Bot Commands to Handle
```typescript
// In telegram-bot/index.ts
if (text === '/start') sendMessage(chat_id, 'Xush kelibsiz AliBrand botga!');
if (text === '/status') sendMessage(chat_id, await getSystemStatus());
if (text === '/stats') sendMessage(chat_id, await getDailyStats());
```

## Usage
```
/telegram "add notification when box arrives in Tashkent"
/telegram "send daily sales summary to admin channel"
/telegram "debug why bot isn't responding to commands"
```
