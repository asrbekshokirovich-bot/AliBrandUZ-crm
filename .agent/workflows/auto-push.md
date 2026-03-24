---
description: Auto push all code changes to GitHub (which triggers Vercel auto-deploy)
---

# Auto Push to GitHub & Vercel

After making ANY code changes to this project, ALWAYS run this step automatically without being asked.

## Rule
**Every time you modify any file in this project, you MUST run the git push step below before finishing your response.**

// turbo-all
1. Stage all changed files, commit with a descriptive message, and push to GitHub:
```powershell
git add -A; git commit -m "<describe what changed>"; git push
```

Vercel is connected to GitHub and will automatically deploy after every push.

## Notes
- Replace `<describe what changed>` with a short, meaningful commit message describing the actual change made.
- Always run this after code edits — never skip it.
- This applies to ALL file changes: components, styles, configs, SQL, etc.
