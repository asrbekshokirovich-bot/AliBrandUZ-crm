---
description: Test-driven development workflow - write tests first
---

# /tdd — Test-Driven Development

Write tests first, then implement. Red → Green → Refactor.

## TDD Cycle

### 1. Write a Failing Test (Red)
```typescript
// src/__tests__/useBoxes.test.ts
import { renderHook } from '@testing-library/react';
import { useBoxes } from '../hooks/useBoxes';

describe('useBoxes', () => {
  it('should return boxes for a store', async () => {
    const { result } = renderHook(() => useBoxes('store-id-123'));
    // This will fail until implemented
    expect(result.current.boxes).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });
});
```

### 2. Run the Test (See it Fail)
```bash
npm test
# Expected: FAIL src/__tests__/useBoxes.test.ts
```

### 3. Write Minimal Implementation (Green)
Write only enough code to make the test pass.

### 4. Run Tests Again
```bash
npm test
# Expected: PASS
```

### 5. Refactor (Keep Tests Green)
Clean up the implementation while tests stay passing.

## Test Types for alicargo-joy-main

### Unit Tests (utilities, calculations)
```typescript
// Test the landed cost formula
describe('calculateLandedCost', () => {
  it('should distribute cost proportionally by weight', () => {
    const result = calculateLandedCost({
      totalCost: 1000,
      boxes: [{ weight: 10 }, { weight: 20 }]
    });
    expect(result[0].landedCost).toBe(333.33);
    expect(result[1].landedCost).toBe(666.67);
  });
});
```

### Integration Tests (hooks + Supabase mock)
```typescript
// Mock Supabase for hook tests
jest.mock('../integrations/supabase/client');
```

### E2E Tests (browser flows)
- Use Playwright or Cypress for full flow testing

## Setup
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

Add to `vite.config.ts`:
```typescript
test: { environment: 'jsdom' }
```

## Usage
```
/tdd "useBoxes hook returns filtered boxes by store"
/tdd "calculateLandedCost distributes proportionally"
/tdd "BoxCreator form validates required fields"
```
