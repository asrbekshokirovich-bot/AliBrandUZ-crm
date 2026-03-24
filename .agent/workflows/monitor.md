---
description: Monitor app health, errors, logs, and production metrics
---

# /monitor — Monitoring and Logging Workflow

Monitor the health of alibrand.uz in production.

## Health Check Locations

### Frontend (Vercel)
```bash
# Check deployment status
npx vercel ls

# View recent logs
npx vercel logs --prod

# Check function invocations
# → vercel.com → Project → Functions tab
```

### Backend (Supabase)
```bash
# View Edge Function logs
npx supabase functions logs ali-ai-brain --tail
npx supabase functions logs telegram-bot --tail
npx supabase functions logs uzum-orders --tail

# Or in Dashboard:
# supabase.com → Your project → Edge Functions → Logs
```

### Database
```sql
-- Check for errors in Supabase logs
-- supabase.com → Logs → Postgres

-- Check slow queries (> 1 second)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table sizes
SELECT table_name, pg_size_pretty(pg_total_relation_size(table_name::regclass))
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(table_name::regclass) DESC;
```

## Key Metrics to Watch

| Metric | Target | Check |
|---|---|---|
| Page load time | < 2s | Vercel Analytics |
| AI response time | < 5s | Edge Function logs |
| Marketplace sync | Every 15min | cron job logs |
| DB connections | < 80% | Supabase dashboard |
| Storage usage | < 80% | Supabase Storage |

## Add Error Tracking
```typescript
// In React components — catch and report errors
const handleError = (error: Error, context: string) => {
  console.error(`[ERROR][${context}]:`, error.message, error.stack);
  
  // Optional: send to Telegram
  supabase.functions.invoke('send-telegram-alert', {
    body: { message: `🚨 Error in ${context}:\n${error.message}` }
  });
};
```

## Cron Job Health (Marketplace Sync)
```sql
-- Check if marketplace sync is running
SELECT function_name, status, created_at 
FROM supabase_functions.hooks
ORDER BY created_at DESC
LIMIT 20;
```

## Alert Rules (Set Up in Telegram Bot)
```
Trigger alerts for:
- Edge Function failure rate > 10%
- DB response time > 2s
- Marketplace sync fails 3 times
- Stock reaches 0 for any product
- New order not processed in 30min
```

## Usage
```
/monitor "check why marketplace sync stopped"
/monitor "view Ali AI error logs from last hour"
/monitor "check database connection count"
```
