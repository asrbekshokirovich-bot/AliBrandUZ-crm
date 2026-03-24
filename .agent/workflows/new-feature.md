---
description: Create new CRM pages, components, hooks, and features following project patterns
---

# /new-feature — Feature Scaffold Workflow

Scaffold a new feature following alicargo-joy-main patterns.

## Project Architecture
```
src/
  pages/crm/          ← CRM pages (Boxes, TashkentDashboard, etc.)
  components/         ← Shared UI components
    ui/               ← shadcn/ui primitives
    crm/              ← CRM-specific components
    tashkent/         ← Tashkent warehouse components
  hooks/              ← Custom React hooks (useQuery wrappers)
  lib/                ← Utilities (fetchAllRows, etc.)
api/                  ← Vercel Edge Functions (AI endpoints)
supabase/
  functions/          ← Supabase Edge Functions
  migrations/         ← SQL migrations
```

## Scaffold Checklist

### 1. New CRM Page
```typescript
// src/pages/crm/MyNewPage.tsx
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

export default function MyNewPage() {
  const { t } = useTranslation();
  
  const { data, isLoading } = useQuery({
    queryKey: ['my-data'],
    queryFn: async () => {
      const { data, error } = await supabase.from('my_table').select('*');
      if (error) throw error;
      return data;
    },
  });
  
  return <div>{/* UI here */}</div>;
}
```

### 2. Add Route to App.tsx
```typescript
<Route path="/crm/my-page" element={<MyNewPage />} />
```

### 3. Add to Sidebar (Layout.tsx)
```typescript
{ path: '/crm/my-page', label: t('my_page'), icon: Package }
```

### 4. Add Translation Keys
```typescript
// in src/i18n/config.ts for uz, ru, en
my_page: 'Mening sahifam',
```

### 5. Create Supabase Table (if needed)
```sql
-- New migration file
CREATE TABLE IF NOT EXISTS public.my_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
```

## Naming Conventions
- Pages: `PascalCase.tsx` → `MyNewPage.tsx`
- Hooks: `useMyHook.ts`
- Components: `MyComponent.tsx`
- API routes: `my-endpoint.ts`
- Tables: `snake_case` (Supabase standard)

## Usage
```
/new-feature "Add a warehousing section for Samarkand"
/new-feature "Create a returns management page"
```
