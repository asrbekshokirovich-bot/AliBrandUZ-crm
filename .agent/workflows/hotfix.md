---
description: Hotfix - urgent production bug fix and emergency deploy
---

# /hotfix — Emergency Production Fix Workflow

For urgent bugs on alibrand.uz that need immediate resolution.

## Hotfix Protocol

### Step 1: Assess Severity
| Level | Description | Response Time |
|---|---|---|
| P0 - Critical | Site down / login broken / data loss | < 15 mins |
| P1 - High | Core CRM feature broken | < 1 hour |
| P2 - Medium | UI bug / non-critical feature | < 4 hours |

### Step 2: Reproduce on Localhost
```bash
npm run dev
# Navigate to the broken page
# Check browser console for errors
```

### Step 3: Fix with Minimal Risk
```
Rules for hotfixes:
✅ Fix only what is broken — no refactoring
✅ Keep changes < 20 lines ideally
✅ Add console.log for verification
❌ Do NOT rewrite components
❌ Do NOT change DB schema (unless P0)
❌ Do NOT add new dependencies
```

### Step 4: Verify Locally
```bash
npx tsc --noEmit          # TypeScript check
npm run build             # Full build check
# Manual test in browser
```

### Step 5: Emergency Deploy
```bash
# Commit with hotfix tag
git add -A
git commit -m "hotfix: [describe the fix] - P{0|1|2}"

# Deploy immediately (skip normal PR process)
npx vercel --prod

# If DB migration needed (emergency only)
# Run SQL directly in Supabase Dashboard → SQL Editor
```

### Step 6: Verify on Production
```bash
# Check alibrand.uz
# Check Vercel deployment logs
npx vercel logs --prod
```

### Step 7: Post-Mortem
```
After fixing:
1. Document: What broke? Why? How was it fixed?
2. Add to /debug workflow if it's a common pattern
3. Add automated protection if possible
```

## Common Production Issues

| Issue | Quick Fix |
|---|---|
| Blank CRM page | Check env vars in Vercel dashboard |
| AI not responding | Check GEMINI_API_KEY in Supabase secrets |
| Login loop | Clear Supabase auth session issues |
| Data not loading | Check Supabase RLS policies |
| Marketplace sync stopped | Check Edge Function logs |

## Usage
```
/hotfix "CRM login page shows blank for all users"
/hotfix "boxes page crashes when clicking packing button"
/hotfix "AI brain returns 500 error"
```
