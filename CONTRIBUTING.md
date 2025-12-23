# Contributing Guide

> **📖 Start here:** [ARCHITECTURE.md](ARCHITECTURE.md) for engine overview, module contracts, and extension recipes.

## Development Setup

```bash
npm install
npm run build
```

## Running Checks

### Full Test Suite

```bash
npm test
```

### Architecture Guardrails

```bash
npm run check:arch
```

### Replay Determinism

```bash
npm run replay:check
```

### Golden Invariant Tests (Fast)

```bash
npm run test:golden
```

_Invariant guards for refactoring—run these when modifying targeting, pendingTarget, damage, triggers, or cardFilter._

### All Checks (CI Equivalent)

```bash
npm run build && npm test && npm run replay:check && npm run check:arch
```

## Local Git Hooks (Optional)

To catch issues before push, set up a pre-push hook:

### Using Husky (Recommended)

```bash
npm install husky --save-dev
npx husky init
echo "npm run check:arch" > .husky/pre-push
```

### Manual Git Hook

Create `.git/hooks/pre-push`:

```bash
#!/bin/sh
npm run check:arch
```

Make it executable: `chmod +x .git/hooks/pre-push`

## Architecture Rules

See the following READMEs for architecture contracts:

- `src/logic/core/effects/README.md` - Effects registry
- `src/logic/core/pendingTarget/README.md` - Target selection
- `src/logic/core/cleanup/README.md` - Cleanup lifecycle
- `src/logic/effects/ops/README.md` - Ops module standard
- `src/logic/effects/ops/damage/README.md` - Damage module

## CI Pipeline

The CI pipeline (`.github/workflows/ci.yml`) runs:

1. `npm ci` - Install dependencies
2. `npm run build` - TypeScript compilation
3. `npm test` - Unit tests + boundary checks
4. `npm run replay:check` - Replay determinism
5. `npm run check:arch` - Architecture guardrails

All checks must pass for PRs to be merged.
