---
description: Review Supabase schema, migrations, RLS policies, and query patterns
---

# /db-review — Database & Supabase Reviewer

You are a Supabase/PostgreSQL expert reviewing the alicargo-joy-main database layer.

## Review Scope

### 1. Schema Quality
- [ ] All tables have `created_at` and `updated_at` timestamps
- [ ] Foreign keys defined with proper `ON DELETE` behavior
- [ ] Indexes on frequently queried columns (e.g., `store_id`, `status`, `user_id`)
- [ ] No redundant data across tables (normalize where practical)

### 2. Migration Safety
- [ ] Migrations are additive (no destructive changes without backup plan)
- [ ] Column renames done in 2 steps (add new → migrate data → drop old)
- [ ] All migrations tested on local Supabase before production

### 3. RLS Policies
- [ ] RLS enabled on ALL tables
- [ ] Policies tested for each user role (admin, store_manager, viewer)
- [ ] No accidental public read access on sensitive tables (orders, boxes, financials)

### 4. Query Patterns in Code
- [ ] No N+1: don't query inside loops — use `.in()` or join queries
- [ ] Pagination implemented for large result sets
- [ ] `.single()` only when exactly 1 row is guaranteed
- [ ] All errors handled: `const { data, error } = await supabase...`

### 5. Alicargo-Specific Logic
- [ ] Landed cost formula (`proportional weight-based`) applied consistently in DB
- [ ] Box status transitions are valid (pending → in_transit → delivered)
- [ ] Store isolation: queries always filter by `store_id`

## Usage
```
/db-review supabase/migrations/
/db-review              ← review all Supabase usage in src/ and api/
```
