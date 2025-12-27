# Test Suite Organization

## Trusted Test Suites (Run by Default)

The default `npm test` command runs only high-signal, reliable tests:

| Suite | Purpose |
|-------|---------|
| `tests/invariants/` | Engine correctness: determinism, state validity, no-crash |
| `tests/mechanics/` | Curated mechanic tests (summon, damage, etc.) |
| `tests/integration/` | Cross-system integration tests |
| `tests/unit/` | Remaining unit tests (non-card-expectation) |

### Invariant Tests Guarantee:

1. **Determinism**: Same seed produces identical game states
2. **State Validity**: No NaN, broken zones, or corruption
3. **No-Crash Smoke**: Random actions across seeds don't throw
4. **Action Legality**: `getLegalActions()` returns only valid actions

---

## Quarantined/Legacy Tests

These tests are **excluded from default runs** because they are:
- Brittle card JSON expectation tests
- Validation tests that depend on external data
- Stale regression tests

| Folder | Status |
|--------|--------|
| `tests/legacy/` | Quarantined - may fail |
| `tests/golden/` | Excluded - may be stale |
| `tests/scenarios/` | Excluded - manual tests |
| `tests/regression/` | Excluded - historical |
| `tests/_dev/` | Dev-only scratchpad |

### Run Legacy Tests (Optional)

```bash
npx vitest run --dir tests/legacy
```

---

## Adding New Tests

### For Engine Mechanics

Add to `tests/mechanics/`:
```typescript
// tests/mechanics/my-mechanic.test.ts
describe("My Mechanic", () => {
  // Use ScenarioRunner or test harness
});
```

### For Invariants/Correctness

Add to `tests/invariants/`:
```typescript
// Use benchEnv for state creation
// Focus on properties, not specific card behaviors
```

### For Card-Specific Behavior

**Avoid card JSON expectation tests.** Use ScenarioRunner instead:
```typescript
// Good: Test behavior
scenario.playCard("Card Name");
expect(state.player1.board.length).toBe(1);

// Bad: Test JSON structure
expect(card.fanfare[0].op).toBe("draw");
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run trusted tests only |
| `npm run test:legacy` | Run legacy tests (may fail) |
| `npm run test:all` | Run all tests including legacy |
| `npm run test:watch` | Watch mode for trusted tests |
