---
description: Diagnose and fix build, TypeScript, or runtime errors
---

# /build-fix — Build Error Fixer

Systematically diagnose and fix build, TypeScript, or runtime errors.

## Protocol

### 1. Read the Error
Copy the full error output. Identify:
- Error type: TypeScript / Vite / ESLint / Runtime?
- File and line number
- Full error message

### 2. Common Error Patterns

| Error | Likely Cause | Fix |
|---|---|---|
| `TS2345` Type mismatch | Wrong prop type or missing field | Check interface definition |
| `TS2304` Cannot find name | Missing import or type | Add import or run `supabase gen types` |
| `Module not found` | Wrong path or missing install | Check import path, run `npm install` |
| `ReferenceError` | Using variable before declaration | Check hook call order |
| `Cannot read properties of undefined` | Null/undefined data | Add optional chaining `?.` |
| Vite build fails | ESM/CJS mismatch | Check `vite.config.ts` |

### 3. Fix Process
1. Read the error carefully
2. Find the referenced file and line
3. Apply the minimal fix
4. Run `npm run build` or `npm run dev` to verify
5. If types are stale: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`

### 4. Verify
```bash
npm run build
# Should output: ✓ built in Xs
```

## Usage
```
/build-fix "TS2345: Argument of type 'string' is not assignable to parameter of type 'number'"
/build-fix "Module not found: @/components/ui/button"
/build-fix "Cannot read properties of undefined (reading 'map')"
```
