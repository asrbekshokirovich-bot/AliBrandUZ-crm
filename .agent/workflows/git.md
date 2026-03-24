---
description: Git workflow - commit, branch, merge, and push changes
---

# /git — Git Workflow

Manage version control for alicargo-joy-main project.

## Daily Workflow

### 1. Check Status Before Anything
```bash
git status
git diff --stat
```

### 2. Stage & Commit
```bash
# Stage specific files
git add src/pages/crm/Boxes.tsx src/lib/fetchAllRows.ts

# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "fix: boxes not appearing after creation (fetchAllRows factory pattern)"
```

### 3. Commit Message Format
```
type(scope): short description

Types: feat | fix | refactor | style | docs | chore | perf | test
Scope: crm | ai | db | ui | api | auth | i18n

Examples:
  feat(crm): add marketplace sub-tabs to Nakladnoylar
  fix(boxes): optimistic update for box creation
  refactor(ai): improve Gemini prompt for UZS calculations
  chore(db): add marketplace column migration
```

### 4. Push to Remote
```bash
# Push current branch
git push origin main

# Push and set upstream (first time)
git push -u origin feature/my-feature
```

### 5. View Recent Commits
```bash
git log --oneline -10
git log --oneline --graph -20
```

### 6. Undo Changes
```bash
# Undo uncommitted changes to a file
git checkout -- src/pages/crm/Boxes.tsx

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Amend last commit message
git commit --amend -m "new message"
```

## Usage
```
/git              ← commit and push all changes
/git log          ← show recent commit history
/git undo         ← undo last commit
```
