/**
 * Headless mulligan mutations (no DOM). Browser UI wraps these.
 */

import { state } from "../../core/gameState.js";
import { drawCard, shuffleInPlace } from "../../core/utils.js";
import { logEvent } from "../../core/logger.js";
import { doAction } from "../../core/history.js";
import type { Player } from "../../core/types/index.js";
import { getHand, getDeck, isFirstPlayer } from "../../core/playerHelpers.js";
import { adapter } from "../../core/adapter.js";
import { bumpZoneVersion } from "./triggers/utils.js";

type MulliganUiHooks = {
  onAdvanceToSecond?: () => void;
  onStartFirstTurn?: () => void;
  hideUi?: () => void;
};

let uiHooks: MulliganUiHooks = {};

/** Browser mulligan module registers DOM hooks here. */
export function setMulliganUiHooks(hooks: MulliganUiHooks): void {
  uiHooks = hooks;
}

function ownerZones(owner: Player) {
  return {
    hand: getHand(state, owner),
    deck: getDeck(state, owner),
  };
}

function markSelectable(owner: Player) {
  const { hand } = ownerZones(owner);
  hand.forEach((c) => {
    (c as any).__mulliganSelectable = true;
    (c as any).__mulliganSelected = false;
  });
}

function clearSelectable(owner: Player) {
  const { hand } = ownerZones(owner);
  hand.forEach((c) => {
    delete (c as any).__mulliganSelectable;
    delete (c as any).__mulliganSelected;
  });
}

/** Start the first main-phase turn after both mulligans. */
export function startFirstTurnCore(opts?: { hideUi?: () => void }) {
  logEvent("startFirstTurn", { active: "first" });
  state.turnNumber = 1;
  const firstHand = getHand(state, "first");
  const firstDeck = getDeck(state, "first");
  drawCard(firstHand, firstDeck, "first");
  state.phase = "main";
  state.activePlayer = "first";
  (opts?.hideUi ?? uiHooks.hideUi)?.();
  adapter.render();
}

export function toggleMulliganPickCore(owner: Player, uid: string): void {
  if (state.phase !== "mulligan") return;
  if (state.mulliganStage !== owner) return;

  const { hand } = ownerZones(owner);
  const card = hand.find((c) => c.uid === uid);
  if (!card || !(card as any).__mulliganSelectable) return;

  const bag = isFirstPlayer(owner)
    ? state.mulliganFirstSelected
    : state.mulliganSecondSelected;
  if (!bag) return;

  const deselecting = !!(card as any).__mulliganSelected;
  if (!deselecting && bag.size >= 4) return;

  doAction(
    "Toggle Mulligan",
    () => {
      if ((card as any).__mulliganSelected) {
        (card as any).__mulliganSelected = false;
        bag.delete(uid);
      } else {
        (card as any).__mulliganSelected = true;
        bag.add(uid);
      }
      adapter.render();
    },
    { owner, uid, stage: "mulligan" },
    { autoRender: true },
  );
}

/**
 * Confirm mulligan for `owner`. Uses registered UI hooks when present.
 */
export function confirmMulliganCore(
  owner: Player,
  hooks?: MulliganUiHooks,
): boolean {
  const h = { ...uiHooks, ...hooks };
  doAction(
    "Confirm Mulligan",
    () => {
      if (state.phase !== "mulligan") return;
      if (state.mulliganStage !== owner) return;

      const bag = isFirstPlayer(owner)
        ? state.mulliganFirstSelected
        : state.mulliganSecondSelected;
      if (!bag) return;
      const { hand, deck } = ownerZones(owner);

      if (bag.size > 0) {
        const toPutBack = [];
        for (let i = hand.length - 1; i >= 0; i--) {
          const c = hand[i];
          if (c && bag.has(c.uid)) {
            toPutBack.push(hand.splice(i, 1)[0]!);
          }
        }
        while (hand.length < 4 && deck.length > 0) {
          drawCard(hand, deck, owner);
        }
        deck.push(...toPutBack);
        shuffleInPlace(deck);
        bumpZoneVersion();
      }

      logEvent("mulligan", { owner, kept: [...hand.map((c) => c.name)] });
      clearSelectable(owner);
      bag.clear();

      if (isFirstPlayer(owner)) {
        state.mulliganStage = "second";
        markSelectable("second");
        adapter.render();
        h.onAdvanceToSecond?.();
      } else {
        if (h.onStartFirstTurn) {
          h.onStartFirstTurn();
        } else {
          const opts = h.hideUi ? { hideUi: h.hideUi } : undefined;
          startFirstTurnCore(opts);
        }
      }
    },
    { owner, stage: "mulligan" },
    { autoRender: true },
  );

  return state.phase === "main";
}
