---
description: Plan a new feature or task with implementation blueprint
---

# /plan — Feature Planner

Create a detailed implementation blueprint before writing any code.

## Planning Protocol

### 1. Understand Requirements
- Restate the feature in your own words
- Identify the user-facing goal
- List any edge cases or constraints

### 2. Identify Affected Layers
Map every layer that will change:
- **UI**: Which React components / pages?
- **Hooks**: Which custom hooks or state changes?
- **API**: New or modified API routes? (`api/`)
- **Supabase Functions**: Any edge functions? (`supabase/functions/`)
- **Database**: New tables, columns, RLS policies, or migrations?
- **Types**: TypeScript type updates?

### 3. Write the Blueprint

```markdown
## Feature: [Name]

### Goal
[What the user can do after this is done]

### UI Changes
- [ ] Component: `src/components/...`
- [ ] Page: `src/pages/...`

### Data Model
- [ ] Table: `table_name` — add column `col` (type)
- [ ] Migration: `supabase/migrations/YYYYMMDD_feature.sql`
- [ ] RLS: allow authenticated users to SELECT / INSERT

### API / Functions
- [ ] `api/route.ts` — new endpoint
- [ ] `supabase/functions/fn-name/` — new edge function

### Types
- [ ] Run `supabase gen types typescript` after migration

### Verification
- [ ] Manual test: steps to verify it works
- [ ] Edge cases: what could go wrong?
```

### 4. Confirm Before Coding
Present the plan, get approval, then execute step by step.

## Usage
```
/plan "Add marketplace filter to Nakladnoylar page"
/plan "Build AI-powered box weight estimator"
/plan "Add role-based access: admin vs operator"
```
