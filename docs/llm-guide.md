# LLM Contributor Guide

## Where to start
-   **New Card**: Add entry to `cards/card_details.json`. If generic effects (Deal Damage, Buff) are sufficient, you are done.
-   **New Effect**: Check `src/logic/effects/ops/`. If operation (e.g., `banish`) exists, reuse it. If not, add new `.ts` file in `ops/`.
-   **Rule Change**: Modify `src/logic/core/turns.ts` or `src/logic/index.ts`.
-   **UI Bug**: Check `src/ui/render.ts` or `src/ui/zones.ts`.

## Do / Don't

### DO
-   **Use `src/engine.ts`** as the main entry point for game control.
-   **Add tests** when adding new logic. `npm test` must pass.
-   **Use `.js` extensions** for all relative imports in `src/`.

### Engine API
-   `startNewGame(options?: StartGameOptions)`: Resets game.
-   `dispatch(state, action)`: Mutates state. Use `PlayerAction` types.
-   `getState()`: Returns current state (Read-Only).
-   **Do not mutate state directly** in UI or Boot.

### Architecture Guardrails
-   **Core/Logic must NOT import UI**.
-   `npm run check:boundaries` validates this.

### DO NOT
-   **Do NOT edit `node_modules/`**.
-   **Do NOT touch `dist/`**. It is generated.
-   **Do NOT import DOM types** in `src/core/` or `src/logic/` (keep logic pure).
-   **Do NOT introduce path aliases** in `tsconfig.json`. Use strict relative paths.

## Invariants
1.  **GameState** is a singleton defined in `src/core/gameState.ts` (`state`).
2.  **Mutations** must go through `src/logic/` functions. Do not mutate `state` directly in UI code.
3.  **RNG** must use `src/core/rng.ts` for deterministic replays.

## Preferred Workflow
1.  Read `src/engine.ts` to understand available actions.
2.  Make changes in `src/`.
3.  Run `npm run build`.
4.  Run `npm test`.

## Commands
-   **Build**: `npm run build` (runs `tsc`).
-   **Test**: `npm test` (runs `vitest`).
-   **Serve**: Use a static server (e.g., Live Server) on the root directory. Open `http://localhost:5500/dist/`.
