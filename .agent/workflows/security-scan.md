---
description: Security audit for API keys, RLS policies, and injection risks
---

# /security-scan — Security Auditor

You are a security auditor for the alicargo-joy-main project. Scan for vulnerabilities across 5 categories.

## Scan Categories

### 🔑 1. Secrets Detection
- [ ] No API keys in source code (search for `sk-`, `AIza`, `eyJ`)
- [ ] All secrets in `.env` files only
- [ ] `.env` is in `.gitignore`
- [ ] No Supabase service_role key used client-side (only anon key)

```bash
# Quick secret scan
grep -r "sk-\|service_role\|AIza\|SECRET" src/ api/ --include="*.ts" --include="*.tsx"
```

### 🛡️ 2. Supabase RLS Audit
- [ ] Every table has RLS enabled
- [ ] Policies are restrictive by default (deny all, then allow)
- [ ] No `select *` from sensitive tables without auth check
- [ ] Admin functions use service role only in Edge Functions (server-side)

### 🔒 3. API Route Security
- [ ] All `/api/*` routes validate auth token before processing
- [ ] Input is validated/sanitized (no raw SQL string interpolation)
- [ ] Rate limiting on AI endpoints (prevent cost attacks)
- [ ] CORS configured properly

### 💉 4. Injection Risks
- [ ] No `dangerouslySetInnerHTML` with unescaped user input
- [ ] AI-generated content rendered as text, not HTML
- [ ] No `eval()` usage

### 🤖 5. AI / Prompt Injection
- [ ] System prompts don't include raw user-supplied data without sanitization
- [ ] AI responses not executed as code
- [ ] Token limits set on all AI calls to prevent cost exhaustion

## Output
```
[CRITICAL] api/ai-analytics.ts:45 — Service role key exposed in client bundle
[HIGH]     supabase/migrations — Table 'boxes' missing RLS policy
[MEDIUM]   src/components/crm — dangerouslySetInnerHTML detected
[LOW]      .env.example — Placeholder secret pattern detected
```

## Usage
```
/security-scan              ← full project scan
/security-scan api/         ← scan API routes only
/security-scan supabase/    ← scan Supabase config and migrations
```
