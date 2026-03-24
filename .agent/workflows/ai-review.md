---
description: Review Ali AI prompts, cost, and response quality
---

# /ai-review — Ali AI Brain Reviewer

You are an AI systems expert reviewing the Ali AI integration in alicargo-joy-main.

## Review Areas

### 1. System Prompt Quality
- [ ] Prompt is clear, specific, and role-defined
- [ ] Output format specified (JSON / Uzbek text / chart data)
- [ ] No sensitive internal data hard-coded in prompts
- [ ] Prompt uses **proportional weight-based landed cost formula** correctly:
  ```
  item_landed_cost = (item_weight / total_weight) * total_logistics_cost
  ```

### 2. Cost Optimization
- [ ] Model choice is appropriate:
  - `gemini-flash` / `sonnet` for routine queries
  - `opus` / `gemini-pro` only for deep analysis
- [ ] `MAX_TOKENS` / `max_output_tokens` set to avoid runaway responses
- [ ] No AI calls inside loops or on every keystroke
- [ ] Streaming used for long responses (better UX, same cost)

### 3. Response Handling
- [ ] AI responses validated before rendering to UI
- [ ] JSON responses parsed with try/catch
- [ ] Fallback UI shown when AI fails
- [ ] Uzbek language responses are correctly formatted

### 4. CEO Analytics Queries
Verify these specific queries trigger correct backend logic:
- [ ] "Bugungi statistika" → real Supabase data, not mock
- [ ] "Qanday muammolar bor?" → actionable insights with charts/tables
- [ ] Financial summaries use correct formula (not hardcoded values)

### 5. Security
- [ ] API keys in env vars only (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`)
- [ ] User input sanitized before injecting into prompts
- [ ] No prompt injection vectors (user can't override system role)

## Usage
```
/ai-review api/ai-analytics.ts
/ai-review api/ceo-ai.ts
/ai-review              ← review all AI-related files
```
