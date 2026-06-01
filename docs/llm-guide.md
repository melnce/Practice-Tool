# LLM Contributor Guide

## Where to start

- **New Card**: Add entry to the set file under `cards/sets/` (canonical source), then run `npm run cards:update` to regenerate `cards/all.json`.
- **New Effect**: Check `src/logic/effects/ops/`. If operation (e.g., `banish`) exists, reuse it. If not, add new `.ts` file in `ops/`.
- **Rule Change**: Modify `src/logic/core/turns.ts` or `src/logic/index.ts`.
- **UI Bug**: Check `src/ui/render.ts` or `src/ui/zones.ts`.

## Do / Don't

### DO

- **Use `src/engine.ts`** as the main entry point for game control.
- **Add tests** when adding new logic. `npm test` must pass.
- **Use `.js` extensions** for all relative imports in `src/`.

### Engine API

- `startNewGame(options: StartGameOptions)`: Resets game. Options:
  - `deckAId` (string): Deck filename without path (e.g. `"starter_deck"`).
  - `deckBId` (string): Deck filename without path.
  - `seed` (number | string): **Required** for determinism. Browser entry (`boot.ts`) generates one when the seed field is empty.
  ```typescript
  await startNewGame({
    deckAId: "starter_deck",
    deckBId: "starter_deck",
    seed: 12345,
  });
  ```
- `dispatch(state, action)`: Mutates state. Use `PlayerAction` types.
  - `PLAY_CARD`: Play a card from hand. `{ type: "PLAY_CARD", player: "first", cardUid: "..." }`
  - `ATTACK`: Attack a target. `{ type: "ATTACK", player: "first", attackerUid: "...", defender: { type: "card", uid: "..." } }`
  - `CHOOSE_TARGET`: Select a target for pending effect. `{ type: "CHOOSE_TARGET", player: "first", target: { type: "card", uid: "..." } }`
- `getState()`: Returns current state (Read-Only).
- **Do not mutate state directly** in UI or Boot.
- **Invariants**: `dispatch` enforces GameState validity in dev/test (throws errors if state is corrupted).

### Architecture Guardrails

- **Core/Logic must NOT import UI**.
- `npm run check:boundaries` validates this.

### DO NOT

- **Do NOT edit `node_modules/`**.
- **Do NOT import DOM types** in `src/core/` or `src/logic/` (keep logic pure).
- **Do NOT introduce path aliases** in `tsconfig.json`. Use strict relative paths (Vite/vitest may use aliases for convenience; source imports stay relative).

## Invariants

1.  **GameState** is a singleton defined in `src/core/gameState.ts` (`state`).
2.  **Mutations** must go through `src/logic/` functions. Do not mutate `state` directly in UI code.
3.  **RNG** must use `src/core/rng.ts` for deterministic replays.

## Preferred Workflow

1.  Read `src/engine.ts` to understand available actions.
2.  Make changes in `src/`.
3.  Run `npm run dev` and open `http://localhost:5173/` (Vite serves `index.html` + transforms `src/`).
4.  Run `npm test`.

## Commands

- **Dev Server**: `npm run dev` (starts Vite with HMR).
- **Test**: `npm test` (runs `vitest`).
- **Type Check**: `npm run typecheck` (checks types without emitting).
- **Replay**: `npm run replay:check` (deterministic shuffle + golden scenarios).
- **Card data sync**: `npm run check:cards` (verifies `cards/all.json` matches merged `cards/sets/`).

## Card data (canonical)

| Path | Role |
|---|---|
| `cards/sets/*.json` | **Source of truth** — one file per expansion set. Edit here. |
| `npm run cards:update` | Merges sets → `cards/all.json` + `cards/index.json`. |
| `cards/all.json` | Generated runtime database (loaded by `src/data/cardDatabase.ts`). |
| `npm run check:cards` | CI guard — fails if `all.json` / `index.json` drift from sets. |

**Not used by the runtime:** `cards/card_sets/`, `cards/card_details.json`, and `cards/classes/` are alternate/legacy export layouts (see `.gitignore`). Do not edit them expecting the game to pick up changes — use `cards/sets/` instead.

## Deck files (canonical)

| Path | Role |
|---|---|
| `decks/*.json` | Deck lists (most are gitignored locally; `starter_deck.json` is tracked). |
| `npm run decks:discover` | Scans `decks/*.json` and writes `decks/manifest.json` for the UI dropdown (runs automatically on `npm run dev` / `npm run build`). |
| `npm run check:decks` | Validates every discovered deck parses cleanly and every card resolves against `cards/all.json`. |

Excluded from discovery: `index.json`, `all_cards.json`, `manifest.json`. Files matching `0_testing_*` appear under a **Test decks** optgroup in the UI.
