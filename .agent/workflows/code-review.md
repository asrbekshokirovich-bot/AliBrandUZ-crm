---
description: Review code for quality, security, and maintainability
---

# /code-review — Code Quality Review

Perform a comprehensive review of code changes for quality, security, and maintainability.

## Review Checklist

### 1. Correctness
- [ ] Does the code do what is described?
- [ ] Are edge cases handled? (null, empty array, network failure)
- [ ] Are loading and error states handled in UI?

### 2. TypeScript Quality
- [ ] No use of `any` type without justification
- [ ] Props and return types are correctly typed
- [ ] Supabase types match actual DB schema

### 3. Security
- [ ] Are API keys used only on the server side? (never in client code)
- [ ] Is user input sanitized before database insertion?
- [ ] Are Supabase RLS policies enforced? (not just UI-level guards)
- [ ] No hardcoded credentials or secrets

### 4. Performance
- [ ] Are queries filtered with `.eq()` / `.in()` — not fetching all rows?
- [ ] Are heavy computations memoized with `useMemo` / `useCallback`?
- [ ] Are images optimized?

### 5. Code Style
- [ ] Consistent naming (`camelCase` for variables, `PascalCase` for components)
- [ ] No dead code or commented-out blocks
- [ ] Functions are small and single-purpose
- [ ] Complex logic has comments

### 6. alicargo-joy-main Specifics
- [ ] Uzbek text is in i18n files, not hardcoded
- [ ] Supabase calls use the shared client from `src/integrations/supabase/client.ts`
- [ ] Toast notifications used for user feedback

## Output Format
```
### Review: [Component/File Name]

✅ Good: [what was done well]
⚠️ Warning: [potential issue]
❌ Bug: [actual problem with fix suggestion]
```

## Usage
```
/code-review src/components/BoxCreator.tsx
/code-review src/hooks/useBoxes.ts
/code-review api/process-invoice.ts
```
