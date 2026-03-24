---
description: Remove dead code, consolidate duplicates, improve structure
---

# /refactor-clean — Code Cleanup & Refactor

Remove dead code, consolidate duplicates, and improve code structure.

## Cleanup Protocol

### 1. Identify Dead Code
```bash
# Find unused exports (requires ts-unused-exports or similar)
npx ts-unused-exports tsconfig.json

# Find TODO/FIXME comments
grep -r "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx"

# Find console.log statements to remove
grep -r "console.log" src/ --include="*.ts" --include="*.tsx"
```

### 2. Consolidate Duplicates
Look for:
- [ ] Same Supabase query in multiple hooks → extract to shared hook
- [ ] Same UI pattern repeated → create reusable component
- [ ] Same utility function in multiple files → move to `src/lib/utils.ts`
- [ ] Same translation string hardcoded → move to i18n

### 3. Component Structure Review
For each component, check:
- [ ] < 200 lines? If larger, consider splitting
- [ ] Single responsibility? (one main purpose)
- [ ] Props interface defined and typed?
- [ ] No inline styles that belong in CSS

### 4. Hook Structure Review
For each custom hook in `src/hooks/`:
- [ ] Fetches only what it needs
- [ ] Returns typed data
- [ ] Handles loading + error states
- [ ] Uses React Query for caching (`@tanstack/react-query`)

### 5. After Refactoring
- [ ] Run `npm run build` — no errors
- [ ] Run `npm run dev` — app works correctly
- [ ] Test affected features manually

## Output Format
```
### Refactor Summary for [file/area]

Removed: [what was deleted]
Consolidated: [what was merged]
Moved: [what was relocated]
Result: [lines before → after, or complexity improvement]
```

## Usage
```
/refactor-clean src/components/CRM/
/refactor-clean src/hooks/
/refactor-clean "remove all console.logs and TODO comments"
```
