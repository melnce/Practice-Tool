// src/logic/core/playCard/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE MODE - Changes require updating invariant tests + contract docs.
// Name-based card checks must not be reintroduced. Use card ID only.
// Contract: docs/playcard-contract.md
// ─────────────────────────────────────────────────────────────────────────────
// Public API for playCard. This is the ONLY layer that handles rendering.

import { CardInstance, Player } from "../../../core/types.js";
import { beginAction, commitAction, abortAction } from "../../../core/history.js";
import { playCardCore } from "./core.js";
import { adapter } from "../../../core/adapter.js";
import { logEvent } from "../../../core/logger.js";
import { PlayOutcome } from "./types.js";

/**
 * Play a card from hand. This is the main entry point.
 * - Wraps core logic in beginAction/commitAction for history management.
 * - Handles rendering based on PlayOutcome.
 * - Returns PlayOutcome for caller inspection.
 */
export function playCard(fromHand: CardInstance[], player: Player, index: number): PlayOutcome {
    const card = fromHand?.[index];
    const meta = { player, index, name: card?.name, uid: card?.uid };

    beginAction("Play Card", meta);

    try {
        // Log before core execution
        if (card) {
            logEvent("playCard:start", { player, card: card.name, uid: card.uid });
        }

        const outcome = playCardCore(fromHand, player, index);

        // Post-execution logging
        if (card) {
            logEvent("playCard:outcome", { player, card: card.name, uid: card.uid, kind: outcome.kind });
        }

        // Commit the action (without auto-render, we handle it ourselves)
        commitAction({ autoRender: false });

        // Render based on outcome (adapter.render() is no-op if not injected)
        if (outcome.kind === "done" || outcome.kind === "paused") {
            adapter.render();
        }

        return outcome;
    } catch (e) {
        abortAction();
        throw e;
    }
}

/**
 * Play a card without rendering or history. For use in tests and headless mode.
 * Returns the PlayOutcome directly.
 */
export function playCardNoRender(fromHand: CardInstance[], player: Player, index: number): PlayOutcome {
    return playCardCore(fromHand, player, index);
}

// Re-export types for consumers
export type { PlayOutcome } from "./types.js";
export { playCardCore } from "./core.js";
