---
description: Onboard new developers to the alicargo-joy-main project
---

# /onboard — Developer Onboarding Workflow

Get new developers up and running with alicargo-joy-main quickly.

## Project Overview
```
AliBrand / AliBrand.uz
├── Frontend: React + Vite + TypeScript + shadcn/ui
├── Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
├── AI: Google Gemini (Ali AI Brain)
├── Hosting: Vercel (frontend) + Supabase (backend)
├── Marketplaces: Uzum Market, Yandex Market, Wildberries
├── Notifications: Telegram Bot
└── Language: O'zbek (uz), Russian (ru), English (en)
```

## Setup Steps (New Developer)

### Step 1: Clone and Install
```bash
git clone https://github.com/your-org/alicargo-joy-main.git
npm install
```

### Step 2: Set Up Environment
```bash
# Copy and fill in the values
cp .env.example .env.local
# Edit .env.local with actual Supabase URL and keys
```

### Step 3: Run Locally
```bash
npm run dev
# Opens at http://localhost:8080
```

### Step 4: Understand the Codebase
```
Key files to read first:
1. src/App.tsx              ← All routes
2. src/pages/crm/Layout.tsx ← CRM sidebar navigation
3. src/i18n/config.ts       ← All translations
4. src/integrations/supabase/client.ts ← DB client
5. src/hooks/useUserRole.ts ← Permission system
```

### Step 5: Understand the Database
```sql
-- Key tables (run in Supabase SQL Editor)
\dt public.*

-- Most important:
-- boxes, product_items, products, marketplace_orders
-- user_roles, handover_invoices, direct_sales
```

## CRM Section Map
```
/crm                    → TashkentDashboard (main)
/crm/boxes              → Boxes management  
/crm/store-analytics    → Store analytics
/crm/marketplace-analytics → Marketplace KPIs
/crm/ali-ai             → Ali AI Brain
/crm/admin/categories   → Category management
/crm/admin/users        → User management
```

## User Role Guide
```
bosh_admin  → Full access (super admin)
rahbar      → CEO dashboard + read all
xitoy_manager → China warehouse operations
xitoy_packer  → Pack boxes, scan items
uz_manager    → Tashkent warehouse management
uz_staff      → Tashkent warehouse operations
```

## Development Workflow
```
1. Create feature branch: git checkout -b feat/my-feature
2. Plan: /plan "describe the feature"
3. Code + test locally
4. TypeScript check: npx tsc --noEmit
5. Commit: git commit -m "feat: ..."
6. Deploy: /deploy
```

## Quick Reference Commands
```bash
npm run dev           # Start dev server (port 8080)
npx tsc --noEmit      # TypeScript check
npm run build         # Production build
npx vercel --prod     # Deploy to production
npx supabase functions deploy FUNCTION_NAME
```

## Usage
```
/onboard              ← show this guide
/onboard "add new uz_staff user"
/onboard "explain how realtime subscriptions work"
```
