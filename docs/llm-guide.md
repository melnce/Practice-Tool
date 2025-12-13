# LLM Contributor Guide

## Where to start
-   **New Card**: Add entry to `cards/all.json` (or specific set file in `cards/sets/`).
-   **New Effect**: Check `src/logic/effects/ops/`. If operation (e.g., `banish`) exists, reuse it. If not, add new `.ts` file in `ops/`.
-   **Rule Change**: Modify `src/logic/core/turns.ts` or `src/logic/index.ts`.
-   **UI Bug**: Check `src/ui/render.ts` or `src/ui/zones.ts`.

## Do / Don't

### DO
-   **Use `src/engine.ts`** as the main entry point for game control.
-   **Add tests** when adding new logic. `npm test` must pass.
-   **Use `.js` extensions** for all relative imports in `src/`.

### Engine API
### Engine API
-   `startNewGame(options: StartGameOptions)`: Resets game. Options:
    -   `deckAId` (string): Filename for Blue deck (e.g. "sample_blue").
    -   `deckBId` (string): Filename for Red deck.
    -   `seed?` (number): Optional generic seed for RNG determinism.
    ```typescript
    await startNewGame({ deckAId: "sample_blue", deckBId: "sample_red", seed: 12345 });
    ```
-   `dispatch(state, action)`: Mutates state. Use `PlayerAction` types.
    - `PLAY_CARD`: Play a card from hand. `{ type: "PLAY_CARD", player: "blue", cardUid: "..." }`
    - `ATTACK`: Attack a target. `{ type: "ATTACK", player: "blue", attackerUid: "...", defender: { type: "card", uid: "..." } }`
    - `CHOOSE_TARGET`: Select a target for pending effect. `{ type: "CHOOSE_TARGET", player: "blue", target: { type: "card", uid: "..." } }`
-   `getState()`: Returns current state (Read-Only).
-   **Do not mutate state directly** in UI or Boot.
-   **Invariants**: `dispatch` enforces GameState validity in dev/test (throws errors if state is corrupted).

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

### Card Import Pipeline
A deterministic pipeline exists to convert raw card descriptions into compiled JSON.
- **Raw**: `cards/raw/*.json` (Input)
- **Compiled**: `cards/compiled/*.json` (Output)
- **Compiler logic**: `src/data/textCompiler/compiler.ts`
- **Commands**:
    - `npm run import:cards`: Compiles raw -> compiled.
    - `npm run validate:cards`: Checks compiled output for unresolved text.
    - `npm run cards:all`: Runs both.

> [!NOTE]
> Do NOT hand-edit files in `cards/compiled/`. Fix the compiler patterns in `src/data/textCompiler/compiler.ts` or the raw input in `cards/raw/` instead.
