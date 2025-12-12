# Architecture Overview

## Project Description
Shadowverse practice tool. A browser-based card game simulator running entirely in the client (TypeScript ESM).

## Layer Responsibilities

-   **src/core/**: Pure domain logic. No DOM access. (`gameState.ts`, `types.ts`, `rng.ts`)
-   **src/logic/**: Game rules, turn flow, effects system. (`startGame.ts`, `effects/`, `mulligan.ts`)
-   **src/data/**: Static data assets. (`cardDatabase.ts`, `deckLoader.ts`)
-   **src/ui/**: DOM manipulation and rendering. (`render.ts`, `dom.ts`, `zones.ts`)
-   **src/boot/boot.ts**: Browser entry point. Wires UI to Engine.
-   **src/engine.ts**: Public API. The single integration point for AI and UI.

## High-Level Flow

1.  `src/boot/boot.ts` initializes events.
2.  User clicks "Start Game" → `src/engine.ts` (`startNewGame`).
3.  `src/logic/startGame.ts` loads decks/cards and resets state.
4.  Game Loop: `src/logic/core/turns.ts` manages phases.
5.  Effects: `src/logic/core/effects/index.ts` processes card abilities.
6.  History: `src/core/history.ts` records snapshots for Undo/Redo.
7.  UI: `src/ui/render.ts` updates the DOM based on `GameState`.

## Key Files
-   `src/engine.ts`: **Start here.** The centralized API.
-   `src/core/gameState.ts`: The singleton state object.
-   `src/logic/core/effects/index.ts`: The effects resolution engine.
-   `src/ui/render.ts`: The main render loop.
