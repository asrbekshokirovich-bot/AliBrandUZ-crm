---
description: Set up and manage environment variables for local dev and production
---

# /env-setup — Environment Variables Workflow

Manage environment variables across local dev, Vercel, and Supabase.

## Environment Files

| File | Purpose | Committed to Git? |
|---|---|---|
| `.env` | Shared defaults (non-secret) | ⚠️ Be careful |
| `.env.local` | Local overrides (secrets) | ❌ Never commit |
| `.env.production` | Production Vercel vars | ❌ Use Vercel dashboard |

## Required Environment Variables

### Frontend (Vite — must be prefixed `VITE_`)
```bash
# .env.local
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_GEMINI_API_KEY=AIza...
```

### Supabase Edge Functions (set in Supabase Dashboard → Settings → Edge Functions)
```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Auto-provided by Supabase
GEMINI_API_KEY=AIza...             # For Ali AI
UZUM_API_KEY=...                   # Uzum Market API
UZUM_SELLER_ID=...
YANDEX_API_KEY=...                 # Yandex Market API
YANDEX_CAMPAIGN_ID=...
TELEGRAM_BOT_TOKEN=...             # Telegram Bot
EXCHANGE_RATE_API_KEY=...          # Currency rates
```

### Vercel (Frontend deployment)
```bash
# Set via: vercel env add VARIABLE_NAME
# Or via: vercel.com → Project → Settings → Environment Variables
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_GEMINI_API_KEY=...
```

## Add to Vercel via CLI
```bash
# Add environment variable to production
npx vercel env add VITE_SUPABASE_URL production

# List all env vars
npx vercel env ls

# Pull env vars to local
npx vercel env pull .env.local
```

## Add to Supabase Edge Functions via CLI
```bash
# Set secret for edge functions
npx supabase secrets set GEMINI_API_KEY=AIza...
npx supabase secrets set TELEGRAM_BOT_TOKEN=...

# List secrets
npx supabase secrets list
```

## Verify Setup
```bash
# Check if Vite can see env vars
npx vite --debug

# In React component (dev only)
console.log(import.meta.env.VITE_SUPABASE_URL);
```

## Common Issues

| Problem | Fix |
|---|---|
| `undefined` env var in React | Must prefix with `VITE_` |
| Edge Function can't find secret | Run `supabase secrets set ...` |
| `.env` not loading | Restart `npm run dev` |
| Production env missing | Add to Vercel dashboard |

## Usage
```
/env-setup "add new Uzum API key to all environments"
/env-setup "check why Gemini API key is undefined in production"
```
