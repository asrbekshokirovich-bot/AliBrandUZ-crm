---
description: Deploy to Vercel and update Supabase Edge Functions
---

# /deploy — Deployment Workflow

Deploy the alicargo-joy-main project to production (Vercel + Supabase).

## Pre-Deploy Checklist
- [ ] `npm run build` passes with 0 errors
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] All `.env` variables added to Vercel dashboard
- [ ] Supabase migrations applied to production
- [ ] No `console.log` with sensitive data

## Step 1: Deploy Supabase Edge Functions
```powershell
# Deploy all functions
.\deploy-all-functions.ps1

# Or deploy a single function
npx supabase functions deploy ai-analytics
npx supabase functions deploy ceo-ai
npx supabase functions deploy scan-return-document
```

## Step 2: Apply Migrations (if any)
```bash
npx supabase db push
```

## Step 3: Deploy to Vercel
```bash
# Deploy to production
npx vercel --prod

# Or push to main branch (auto-deploys if GitHub connected)
git push origin main
```

## Step 4: Verify Production
- [ ] Visit `https://alibrand.uz` — page loads correctly
- [ ] CRM at `https://alibrand.uz/crm` — no blank page
- [ ] Ali AI responds in Uzbek
- [ ] Test one critical flow end-to-end

## Rollback (if something breaks)
```bash
# Revert to previous Vercel deployment
npx vercel rollback

# View deployment history
npx vercel ls
```

## Usage
```
/deploy             ← full deploy checklist + execute
/deploy supabase    ← Supabase Edge Functions only
/deploy vercel      ← Vercel frontend only
```
