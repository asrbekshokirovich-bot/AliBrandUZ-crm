---
description: Create and manage Supabase database migrations safely
---

# /migration — Supabase Migration Workflow

Create and apply database migrations for alicargo-joy-main.

## Migration File Naming
```
supabase/migrations/YYYYMMDDHHMMSS_description.sql
```
Example: `20260324120000_add_marketplace_to_handover_invoices.sql`

## How to Create a Migration

### 1. Create the SQL file
```sql
-- Always use IF NOT EXISTS / IF EXISTS for safety
ALTER TABLE public.handover_invoices 
  ADD COLUMN IF NOT EXISTS marketplace TEXT;

-- Always add indexes for new filterable columns
CREATE INDEX IF NOT EXISTS idx_handover_invoices_marketplace 
  ON public.handover_invoices(marketplace);

-- Always update RLS policies if access changes
-- DROP POLICY IF EXISTS "..." ON table;
-- CREATE POLICY "..." ON table ...;
```

### 2. Apply to Supabase (Production)
Option A — Supabase Dashboard:
1. Go to supabase.com → Your project → SQL Editor
2. Paste the SQL and run it

Option B — CLI:
```bash
npx supabase db push
```

### 3. Verify Migration Applied
```sql
-- Check column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'handover_invoices';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'handover_invoices';
```

## Common Migration Patterns

### Add Column
```sql
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS marketplace TEXT;
```

### Add Foreign Key
```sql
ALTER TABLE public.box_items 
  ADD COLUMN IF NOT EXISTS box_id UUID REFERENCES public.boxes(id) ON DELETE CASCADE;
```

### Add RLS Policy
```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON public.my_table FOR SELECT TO authenticated USING (true);
```

### Add Function (RPC)
```sql
CREATE OR REPLACE FUNCTION public.my_function(p_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- your logic
END;
$$;
```

## Usage
```
/migration "add marketplace column to handover_invoices"
/migration "create RLS policy for new table"
```
