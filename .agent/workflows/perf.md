---
description: Optimize performance - React re-renders, slow queries, lazy loading
---

# /perf — Performance Optimization Workflow

Diagnose and fix performance bottlenecks in alicargo-joy-main.

## Step 1: Identify the Bottleneck

### React Performance
```typescript
// Add React DevTools Profiler to suspect component
import { Profiler } from 'react';
<Profiler id="Boxes" onRender={(id, phase, duration) => {
  console.log(`[PERF] ${id} ${phase}: ${duration}ms`);
}}>
  <BoxList />
</Profiler>
```

### Supabase Query Performance
```sql
-- Check slow queries in Supabase Dashboard → Logs → Postgres
EXPLAIN ANALYZE SELECT * FROM boxes WHERE status = 'packing';
```

## Step 2: Common Fixes

### Too Many Re-renders
```typescript
// Memoize expensive components
const BoxCard = React.memo(({ box }) => { ... });

// Memoize callbacks
const handleClick = useCallback(() => { ... }, [dep]);

// Memoize derived values
const filteredBoxes = useMemo(() => 
  boxes.filter(b => b.status === filter), [boxes, filter]
);
```

### Slow Data Fetching
```typescript
// Add staleTime to avoid redundant refetches
useQuery({
  queryKey: ['boxes'],
  queryFn: fetchBoxes,
  staleTime: 5 * 60 * 1000, // 5 minutes
});

// Use select to return only needed fields from Supabase
supabase.from('boxes').select('id, box_number, status, location')
```

### Large Bundle Size
```bash
# Analyze bundle
npx vite-bundle-analyzer

# Lazy load heavy pages
const BoxesPage = lazy(() => import('./pages/crm/Boxes'));
```

### Image Optimization
```typescript
// Use Supabase Storage transforms for images
const imageUrl = supabase.storage.from('products')
  .getPublicUrl('image.jpg', {
    transform: { width: 200, height: 200, quality: 80 }
  });
```

## Step 3: Supabase Index Optimization
```sql
-- Add indexes for frequently filtered columns
CREATE INDEX IF NOT EXISTS idx_boxes_status ON public.boxes(status);
CREATE INDEX IF NOT EXISTS idx_boxes_location ON public.boxes(location);
CREATE INDEX IF NOT EXISTS idx_boxes_created_at ON public.boxes(created_at DESC);
```

## Performance Targets
- Page load: < 2s
- CRM data fetch: < 500ms  
- React re-render: < 16ms (60fps)

## Usage
```
/perf "Boxes page is slow to load"
/perf "AI chat takes too long to respond"
```
