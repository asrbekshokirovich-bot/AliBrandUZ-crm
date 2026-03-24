---
description: Plan a new feature or task with implementation blueprint
---

# /plan — Feature Planning Workflow

You are acting as a senior planner for the alicargo-joy-main project (TypeScript + React + Supabase + Vite).

## Steps

1. **Understand the request** — Restate the feature in one sentence to confirm alignment.

2. **Research first** — Before writing any code:
   - Read relevant existing files (use find_by_name, grep_search)
   - Identify affected components, hooks, API routes, and Supabase tables
   - Check for existing patterns in `src/components/`, `src/hooks/`, `api/`

3. **Identify dependencies** — List:
   - Files to CREATE (mark [NEW])
   - Files to MODIFY (mark [MODIFY])
   - Files to DELETE (mark [DELETE])
   - Supabase table/RLS changes needed

4. **Write the implementation plan** — Format:
   ```
   ## Goal
   [One sentence]

   ## Affected Areas
   - Components: ...
   - Hooks: ...
   - API: ...
   - Supabase: ...

   ## Step-by-step
   1. ...
   2. ...

   ## Risks / Edge Cases
   - ...
   ```

5. **Confirm with user** before writing any code.

## Usage
```
/plan "Add export to Excel for CRM boxes"
/plan "Fix AI chat memory across sessions"
```
