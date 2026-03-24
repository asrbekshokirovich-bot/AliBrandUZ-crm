---
description: Systematically debug any issue - UI, API, or database
---

# /debug — Systematic Debugger

You are debugging a bug in the alicargo-joy-main project. Follow the scientific method.

## Debug Protocol

### 1. Reproduce First
- Write down the exact steps to reproduce
- Identify: does it happen always, or only sometimes?
- What is the expected vs. actual behavior?

### 2. Isolate the Layer
Determine which layer the bug is in:

```
Browser (React/UI)
    ↓
API Route (Vercel Edge Function / api/*.ts)
    ↓
Supabase Edge Function (supabase/functions/)
    ↓
Database (Supabase / PostgreSQL)
```

### 3. Add Logging at the Boundary
```typescript
// In React component
console.log('[DEBUG] data from hook:', data);

// In API route
console.log('[DEBUG] request body:', req.body);
console.log('[DEBUG] supabase response:', { data, error });

// In Supabase Edge Function
console.log('[DEBUG] invocation:', JSON.stringify(req));
```

### 4. Common alicargo-joy-main Bugs

| Symptom | Likely Cause | Fix |
|---|---|---|
| CRM shows blank page | Missing env vars | Check `.env` and Vercel env vars |
| Boxes not showing | RLS policy blocking | Check Supabase policies |
| AI not responding | API key missing/wrong | Check `GEMINI_API_KEY` |
| Build fails after migration | Types out of date | Run `supabase gen types` |
| Returns scanner fails | File size > limit | Check Supabase storage limits |

### 5. Document the Fix
After fixing:
```
Bug: [what was wrong]
Root cause: [why it happened]
Fix: [what was changed]
Prevention: [how to avoid in future]
```

## Usage
```
/debug "boxes not showing in CRM after creation"
/debug "AI returns undefined instead of Uzbek text"
/debug "build error: TS2345 in useReturnScanner"
```
