---
description: Review Supabase schema, migrations, RLS policies, and query patterns
---

# /db-review — Database Review

Review Supabase schema, migrations, RLS policies, and query patterns.

## Review Areas

### 1. Schema Review
- [ ] Tables have primary keys (`id uuid DEFAULT gen_random_uuid()`)
- [ ] Foreign keys are correctly defined with `REFERENCES`
- [ ] Timestamps: `created_at`, `updated_at` with defaults
- [ ] Nullable vs NOT NULL columns are intentional

### 2. Migration Review
Check files in `supabase/migrations/`:
- [ ] Migrations are reversible (can be rolled back)
- [ ] No data-destructive operations without a backup plan
- [ ] Column renames use add+copy+drop pattern, not direct rename
- [ ] Indexes added for frequently queried columns

### 3. RLS Policy Review
```sql
-- Check existing policies
SELECT tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';
```
- [ ] Every table has RLS enabled (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`)
- [ ] Users can only see their own data (filter by `auth.uid()`)
- [ ] Operators can see their store's data
- [ ] Admin can see all data

### 4. Query Pattern Review
In React hooks (`src/hooks/`):
- [ ] Always handle `{ data, error }` from Supabase
- [ ] Use `.select()` with specific columns, not `*` for large tables
- [ ] Use `.order()` and `.limit()` for lists
- [ ] Use `useQuery` pattern from `@tanstack/react-query` for caching

### 5. alicargo-joy-main Key Tables
| Table | Purpose |
|---|---|
| `boxes` | Individual shipping boxes |
| `nakladnoy` | Marketplace invoices |
| `stores` | Client stores |
| `shipments` | Grouped box shipments |

## Usage
```
/db-review "check RLS policies for boxes table"
/db-review "review new migration for nakladnoy"
/db-review "optimize slow query in useBoxes hook"
```
