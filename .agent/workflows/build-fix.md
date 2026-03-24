---
description: Diagnose and fix build, TypeScript, or runtime errors
---

# /build-fix — Build Error Resolver

You are a build error specialist for the alicargo-joy-main project (Vite + TypeScript + React).

## Diagnostic Steps

### 1. Capture the Error
```bash
npm run build 2>&1
# or for type errors only:
npx tsc --noEmit
```

### 2. Classify the Error

| Error Type | Common Cause | Fix Strategy |
|---|---|---|
| TS2345 — Type mismatch | Wrong prop type | Update interface or cast |
| TS2339 — Property not found | Missing field on type | Add to interface |
| TS18047 — Possibly null | Null safety | Add `?.` or null guard |
| Module not found | Missing import / wrong path | Fix import path |
| Vite env error | Missing `.env` variable | Add to `.env` and `vite-env.d.ts` |
| Supabase type error | Schema mismatch | Run `supabase gen types` |

### 3. Fix Protocol
1. Fix **one error at a time**, starting from the top
2. Re-run build/typecheck after each fix
3. Never use `// @ts-ignore` without a comment explaining why
4. If a Supabase type is wrong → regenerate types first

### 4. Regenerate Supabase Types (if DB schema changed)
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/supabase.ts
```

## Usage
```
/build-fix                     ← paste the error and I'll fix it
/build-fix "TS2345 in CRMSidebar"
```
