---
description: Remove dead code, consolidate duplicates, improve structure
---

# /refactor-clean — Dead Code & Cleanup

You are a refactoring specialist for alicargo-joy-main. Clean without breaking.

## Cleanup Checklist

### 1. Dead Code Removal
- [ ] Unused imports (run TypeScript linter)
- [ ] Commented-out code blocks (delete, not comment)
- [ ] Unused state variables and hooks
- [ ] Unreachable code paths

### 2. Consolidate Duplicates
- [ ] Repeated Supabase query patterns → extract to `src/lib/` utility
- [ ] Repeated UI patterns → extract to `src/components/ui/`
- [ ] Duplicated type definitions → consolidate in `src/types/`

### 3. File Organization
```
src/
  components/
    crm/          ← CRM-specific components
    ali-ai/       ← AI chat components
    ui/           ← Reusable UI primitives
  hooks/          ← All custom hooks
  lib/            ← Pure utilities (no React)
  types/          ← Shared TypeScript types
api/              ← Vercel edge functions
supabase/         ← Migrations, functions, config
```

### 4. Console.log Cleanup
```bash
# Find all console.logs
grep -rn "console\.log" src/ api/ --include="*.ts" --include="*.tsx"
```
- Replace with proper error handling or remove
- Keep only intentional debug logs behind `if (isDev)`

### 5. Safety Rules
- Run `npm run build` before and after
- Do not consolidate files if it creates circular imports
- Keep git history clean: one commit per logical change

## Usage
```
/refactor-clean src/components/crm/
/refactor-clean src/hooks/
/refactor-clean             ← full project cleanup report
```
