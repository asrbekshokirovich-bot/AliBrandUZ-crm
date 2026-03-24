---
description: Test-driven development workflow - write tests first
---

# /tdd — Test-Driven Development Workflow

You are enforcing TDD discipline on the alicargo-joy-main project.

## The TDD Loop

### 🔴 RED — Write a Failing Test First
1. Define the interface/contract of the function/component
2. Write a test that describes the expected behavior
3. Run it — confirm it FAILS (this is correct!)

```typescript
// Example: testing a utility
describe('calculateLandedCost', () => {
  it('applies proportional weight-based formula', () => {
    const result = calculateLandedCost({ weight: 10, totalCost: 100, totalWeight: 50 });
    expect(result).toBe(20); // 10/50 * 100
  });
});
```

### 🟢 GREEN — Implement Minimal Code
- Write the **minimum** code to make the test pass
- No over-engineering, no premature optimization

### 🔵 REFACTOR — Improve Without Breaking
- Clean up code
- Extract reusable utilities
- Ensure all tests still pass

## Coverage Target
- Minimum **80% coverage** for all utility functions and hooks
- 100% coverage for financial calculation logic (landed cost formulas)

## Commands
```bash
# Run tests
npm run test

# Run with coverage
npm run test -- --coverage

# Watch mode during TDD
npm run test -- --watch
```

## Usage
```
/tdd "useReturnScanner hook - file upload logic"
/tdd "calculateLandedCost - weight-based formula"
```
