---
description: Security audit for API keys, RLS policies, and injection risks
---

# /security-scan — Security Audit

Perform a security audit of the alicargo-joy-main codebase.

## Scan Areas

### 1. Exposed Secrets Check
Search for hardcoded credentials:
```bash
# Search for potential API keys
grep -r "sk-" src/
grep -r "AIza" src/
grep -r "eyJ" src/ --include="*.ts" --include="*.tsx"
```
- [ ] No API keys in source code
- [ ] `.env` is in `.gitignore`
- [ ] No secrets committed to git history

### 2. Supabase RLS Audit
```sql
-- Tables without RLS:
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public'
AND tablename NOT IN (
  SELECT DISTINCT tablename FROM pg_policies
);
```
- [ ] All tables have RLS enabled
- [ ] Policies use `auth.uid()` — not open to all users
- [ ] Service role key is never used in client-side code

### 3. API Route Security
Check `api/*.ts` files:
- [ ] Authentication is verified before processing requests
- [ ] Request body is validated (not trusted blindly)
- [ ] Errors don't leak internal details to clients

### 4. Client-Side Security
Check `src/`:
- [ ] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are exposed (these are safe)
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` in client code
- [ ] No `GEMINI_API_KEY` in client code

### 5. Injection Risks
- [ ] User input is not used in raw SQL queries
- [ ] File uploads have type and size validation
- [ ] URL parameters are sanitized before use

## Output Format
```
### Security Scan Results

🔴 Critical: [issue]
🟡 Warning: [issue]
🟢 OK: [checked item]
```

## Usage
```
/security-scan
/security-scan "check if GEMINI_API_KEY is exposed"
/security-scan "audit RLS policies after new migration"
```
