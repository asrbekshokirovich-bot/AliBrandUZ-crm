---
description: Deploy to Vercel and update Supabase Edge Functions
---

# /deploy — Deploy to Production

Deploy the alicargo-joy-main project to Vercel and sync Supabase Edge Functions.

## Pre-Deploy Checklist
- [ ] `npm run build` passes locally
- [ ] `.env` values are set in Vercel dashboard
- [ ] Supabase migrations are applied
- [ ] New edge functions are deployed

## Step 1: Build Check
```bash
npm run build
```
Fix any errors before proceeding.

## Step 2: Deploy Frontend to Vercel
```bash
# If Vercel CLI is installed:
vercel --prod

# Or push to main branch (auto-deploy if connected):
git add .
git commit -m "deploy: [description]"
git push origin main
```

## Step 3: Deploy Supabase Edge Functions
```bash
# Deploy all functions:
npx supabase functions deploy

# Deploy a specific function:
npx supabase functions deploy ali-ai
npx supabase functions deploy process-invoice
```

## Step 4: Apply Database Migrations
```bash
npx supabase db push
```

## Step 5: Verify
- Open https://alibrand.uz
- Check `/crm` loads correctly
- Test AI chat works
- Check Supabase logs for any errors

## Environment Variables Required
| Variable | Location |
|---|---|
| `VITE_SUPABASE_URL` | Vercel + `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env` |
| `GEMINI_API_KEY` | Supabase Edge Function secrets |

## Usage
```
/deploy
/deploy "after adding marketplace filter"
```
