---
description: Review Ali AI prompts, cost, and response quality
---

# /ai-review — Ali AI Quality Review

Review the Ali AI system prompt, API usage, cost, and response quality.

## Review Areas

### 1. System Prompt Quality
Check `supabase/functions/ali-ai/index.ts` or system prompt file:
- [ ] Prompt is in Uzbek for Uzbek responses
- [ ] Financial formulas are clearly defined (Proportional Weight-based Landed Cost)
- [ ] Output format is strictly JSON when needed
- [ ] Hallucination guards are in place ("Only use data provided")
- [ ] Examples of correct vs incorrect outputs are included

### 2. API Cost Review
Gemini API pricing awareness:
- [ ] Are large system prompts minimized?
- [ ] Is conversation history trimmed (not sending entire history every time)?
- [ ] Are file uploads (PDFs, images) compressed before sending?
- [ ] Are responses cached where appropriate?

### 3. Response Quality Checklist
Test with these standard queries:
```
"Bugungi statistika" → Should return today's boxes/revenue data
"Qanday muammolar bor?" → Should return actual issues from DB
"Box narxini hisobla" → Should use correct formula
```

- [ ] Responses are in Uzbek
- [ ] Numbers match actual database values
- [ ] Charts/tables are rendered correctly in UI
- [ ] Error states are handled gracefully

### 4. Security Review
- [ ] `GEMINI_API_KEY` is stored in Supabase secrets, not in code
- [ ] User input is not injected directly into prompts without sanitization
- [ ] Rate limiting is implemented

### 5. Output Format
```
### AI Review Results

Prompt Quality: [score /10]
Cost Efficiency: [assessment]
Response Accuracy: [test results]
Issues Found: [list]
Recommended Fixes: [list]
```

## Usage
```
/ai-review
/ai-review "why is Ali AI returning wrong financial totals?"
/ai-review "optimize prompt to reduce token usage"
```
