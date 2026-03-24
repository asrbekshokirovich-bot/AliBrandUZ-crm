---
description: Manage real-time Supabase subscriptions and live data updates
---

# /realtime — Supabase Realtime Workflow

Manage real-time data subscriptions in alicargo-joy-main.

## Current Realtime Subscriptions
```typescript
// TashkentDashboard.tsx uses these channels:
supabase.channel('tashkent-boxes')     // boxes table changes
supabase.channel('tashkent-items')     // product_items changes
supabase.channel('tashkent-locations') // warehouse_locations changes
```

## Add New Realtime Subscription
```typescript
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function useRealtimeBoxes() {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const channel = supabase
      .channel('boxes-realtime')
      .on(
        'postgres_changes',
        { 
          event: '*',           // INSERT | UPDATE | DELETE | *
          schema: 'public', 
          table: 'boxes',
          filter: 'location=eq.uzbekistan' // optional filter
        },
        (payload) => {
          console.log('[Realtime] boxes changed:', payload.eventType);
          // Invalidate TanStack Query cache
          queryClient.invalidateQueries({ queryKey: ['boxes'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
```

## Realtime with Optimistic Updates (Best Pattern)
```typescript
// 1. Optimistic update (immediate UI)
queryClient.setQueryData(['boxes'], (old: Box[]) => [newBox, ...old]);

// 2. Realtime subscription (for other users)
.on('postgres_changes', { event: 'INSERT', table: 'boxes' }, (payload) => {
  queryClient.setQueryData(['boxes'], (old: Box[]) => {
    // Avoid duplicate from own optimistic update
    const exists = old.some(b => b.id === payload.new.id);
    return exists ? old : [payload.new as Box, ...old];
  });
})
```

## Important Rules
```
✅ Always remove channels in useEffect cleanup
✅ Use specific filters to reduce noise
✅ Combine with TanStack Query for caching
✅ Channel names must be unique across the app

❌ Don't subscribe to entire tables without filters (expensive)
❌ Don't forget to unsubscribe (memory leak)
❌ Don't use realtime for high-frequency data (use polling instead)
```

## Enable Realtime for a Table
```sql
-- In Supabase Dashboard or migration:
ALTER PUBLICATION supabase_realtime ADD TABLE public.my_new_table;
```

## Debug Realtime
```typescript
// Add status listener
const channel = supabase
  .channel('debug-channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'boxes' }, handler)
  .subscribe((status, err) => {
    console.log('[Realtime] status:', status, err);
    // SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED
  });
```

## Usage
```
/realtime "add live updates to marketplace orders table"
/realtime "debug why realtime isn't triggering on box updates"
/realtime "optimize realtime to only listen to uzbekistan location"
```
