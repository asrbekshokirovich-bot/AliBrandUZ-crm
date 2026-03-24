---
description: Review code for quality, security, and maintainability
---

# /code-review — Code Quality Review

You are a senior TypeScript/React code reviewer for the alicargo-joy-main project.

## Review Checklist

### 1. TypeScript Safety
- [ ] No `any` types without justification
- [ ] All props interfaces defined
- [ ] Null/undefined handled explicitly
- [ ] Return types on all async functions

### 2. React Best Practices
- [ ] No missing `useEffect` dependency arrays
- [ ] No unnecessary re-renders (useMemo/useCallback where needed)
- [ ] Keys on all list items
- [ ] Error boundaries in place for risky components

### 3. Supabase / Data Layer
- [ ] No sensitive data exposed client-side
- [ ] RLS policies respected (no direct admin queries from client)
- [ ] All `.supabase` calls have `.error` handling
- [ ] No N+1 query patterns

### 4. Security
- [ ] No hardcoded API keys or secrets
- [ ] User input sanitized before DB writes
- [ ] Environment variables used for all external URLs

### 5. Ali AI Specific
- [ ] System prompts do not expose internal business logic unsafely
- [ ] AI responses validated before rendering
- [ ] Cost-aware: avoid unnecessary LLM calls in loops

## Output Format
For each issue found:
```
[SEVERITY: HIGH/MEDIUM/LOW] Filename:Line
Issue: ...
Fix: ...
```

## Usage
```
/code-review src/components/crm/CRMSidebar.tsx
/code-review api/ai-analytics.ts
/code-review         ← reviews all recently changed files
```
