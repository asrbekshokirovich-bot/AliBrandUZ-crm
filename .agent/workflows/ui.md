---
description: Create and style UI components following the project design system
---

# /ui — UI Component Workflow

Build new UI components for alicargo-joy-main following the design system.

## Design System

### Colors (from index.css)
```css
--primary: hsl(...)         /* Main brand color */
--secondary: ...             /* Secondary */
--muted: ...                 /* Muted text/backgrounds */
--destructive: ...           /* Red / danger */
--card: ...                  /* Card backgrounds */
--border: ...                /* Borders */
--foreground: ...            /* Main text */
--muted-foreground: ...      /* Subtle text */
```

### Marketplace Brand Colors
```typescript
const MARKETPLACE_COLORS = {
  uzum: '#7B2FBE',        // Uzum purple
  yandex: '#FC3F1D',      // Yandex red-orange
  wildberries: '#A000DC', // WB deep purple
};
```

## Available shadcn/ui Components
```
Card, Button, Badge, Input, Select, Dialog, Sheet,
Tabs, TabsList, TabsTrigger, TabsContent,
Collapsible, CollapsibleTrigger, CollapsibleContent,
DropdownMenu, Popover, Tooltip,
Table, TableHeader, TableRow, TableCell,
Form, FormField, FormItem, FormLabel, FormControl,
Avatar, Skeleton, Progress, ScrollArea
```

## Component Creation Template
```typescript
// src/components/crm/MyComponent.tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MyComponentProps {
  title: string;
  count: number;
  className?: string;
  onClick?: () => void;
}

export function MyComponent({ title, count, className, onClick }: MyComponentProps) {
  return (
    <Card 
      interactive 
      className={cn('p-4 cursor-pointer hover:shadow-lg', className)}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          <Badge variant="secondary">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* content */}
      </CardContent>
    </Card>
  );
}
```

## Common UI Patterns

### Loading State
```typescript
{isLoading ? (
  <Skeleton className="h-32 w-full" />
) : data?.length === 0 ? (
  <EmptyState message="Hech narsa topilmadi" />
) : (
  <DataList data={data} />
)}
```

### Responsive Grid
```typescript
<div className="grid grid-cols-1 min-[375px]:grid-cols-2 lg:grid-cols-4 gap-4">
```

### Dark Mode Support
```typescript
// Always use semantic colors, never hardcode light colors
className="bg-card text-foreground border-border"     // ✅
className="bg-white text-black border-gray-200"       // ❌
```

### Mobile First
```typescript
// Use isMobile hook for conditional rendering
const isMobile = useIsMobile();
{isMobile ? <MobileView /> : <DesktopView />}
```

## Lucide Icons Available
```typescript
import { Package, Box, Truck, ShoppingCart, TrendingUp,
         FileText, Archive, Clock, CheckCircle2, XCircle,
         Search, Upload, Download, Plus, Trash2, Edit,
         ChevronDown, ChevronRight, ArrowRight, Loader2 } from 'lucide-react';
```

## Usage
```
/ui "create a stats card component for marketplace revenue"
/ui "add empty state design for search results"
/ui "make boxes table mobile-friendly"
```
