// src/logic/core/cleanup.ts
import { state } from "../../core/gameState.js";
// import { render } from "../../ui/render.js";
import { banishCard } from "../effects/ops/banish/index.js";
// import { runEffects } from "./effects/index.js"; // Breaking cycle
import { logEvent } from "../../core/logger.js";
import { fireTrigger } from "./triggers.js";
import type { CardInstance, Player, Effect } from "../../core/types/index.js";
import { isFirstPlayer, opponentOf, getBoard, getGraveyard, addShadows, getDestroyedHistory } from "../../core/playerHelpers.js";
import { bumpZoneVersion } from "./triggers/utils.js";

// Dependency Injection for runEffects
let runEffects: (
  effects: Effect[],
  owner: Player,
  source: any,
  context?: any,
) => void;
export function registerRunEffectsInCleanup(fn: any) {
  runEffects = fn;
}

export function cleanupDead() {
  // Skip cleanup while a "batch" (like crest EOT) is running.
  if (state.suppressCleanup) return;

  // PERF: Fast numeric coercion helper (avoids parseInt/String)
  const toNum = (v: any): number => typeof v === "number" ? v : (v == null ? 0 : +v);

  // PERF: Fast early-exit if nothing needs cleanup
  const needsCleanup = (board: CardInstance[]) => {
    for (let i = 0; i < board.length; i++) {
      const c = board[i];
      if (!c || typeof c !== "object") return true; // sparse hole needs cleanup
      if ((c as any).pendingDestruction) return true;
      if (c.type === "Follower" && toNum(c.defense) <= 0) return true;
      if (c.type === "Amulet" && c.hasCountdown && toNum(c.countdown) <= 0) return true;
    }
    return false;
  };

  const firstBoard = getBoard(state, "first");
  const secondBoard = getBoard(state, "second");
  if (!needsCleanup(firstBoard) && !needsCleanup(secondBoard)) {
    return; // Fast path: nothing to clean
  }

  const triggerLastWords = (card: CardInstance, owner: Player) => {
    if ((card as any)._lwFired) return; // guard against re-entry
    if (!card?.hasLastWords) return;
    const kw = card.keywordState;
    const lw = kw?.lastWordsEffects || card.lastWordsEffects;
    if (!Array.isArray(lw)) return;
    if (!runEffects) {
      console.warn("cleanupDead: runEffects not registered!");
      return;
    }
    (card as any)._lwFired = true; // mark fired
    runEffects(lw, owner, card); // PERF: Pass directly, no spread
  };

  const cleanSide = (
    board: CardInstance[],
    grave: CardInstance[],
    owner: Player,
  ) => {
    // PERF: Backward iteration for correct death order, null-mark instead of splice
    for (let i = board.length - 1; i >= 0; i--) {
      const c = board[i];

      // Guard against sparse / null slots created by other ops
      if (!c || typeof c !== "object") {
        // Mark for removal instead of splice
        (board as any)[i] = null;
        continue;
      }

      // PERF: Cache type checks and use fast numeric coercion
      const cardType = c.type;
      const isFollower = cardType === "Follower";
      const isAmulet = cardType === "Amulet";
      const defVal = toNum(c.defense);
      const defLE0 = isFollower && defVal <= 0;
      const countdown0 = isAmulet && c.hasCountdown && toNum(c.countdown) <= 0;
      const markedForDeath = !!(c as any).pendingDestruction;
      const shouldDestroy = defLE0 || countdown0 || markedForDeath;

      if (!shouldDestroy) continue;

      // Log only when we actually destroy something
      const cause = defLE0 ? "defense<=0" : countdown0 ? "countdown==0" : "unknown";
      logEvent("destroyQueued", { card: c.name, owner, type: cardType, cause });

      // Cache keywordState for repeated access
      const kw = c.keywordState;

      if (isFollower) {
        // Fire ally trigger for the owner, enemy trigger for the opponent
        const opponent = opponentOf(owner);
        fireTrigger("ally_follower_leaves_field", owner as any, {
          leavingOwner: owner,
          leavingCard: c,
        });
        fireTrigger("enemy_follower_leaves_field", opponent as any, {
          leavingOwner: owner,
          leavingCard: c,
        });

        // Shikigami bookkeeping (track full card for Kuon effect)
        if (Array.isArray(c.tribes) && c.tribes.includes("Shikigami")) {
          if (isFirstPlayer(owner)) {
            if (!state.players.first.shikigamiDeathsThisTurn)
              state.players.first.shikigamiDeathsThisTurn = [];
            state.players.first.shikigamiDeathsThisTurn.push(c);
          } else {
            if (!state.players.second.shikigamiDeathsThisTurn)
              state.players.second.shikigamiDeathsThisTurn = [];
            state.players.second.shikigamiDeathsThisTurn.push(c);
          }
        }

        // Emit only for destroyed (not banish/bounce) Wards
        const isBanishedOnDeathForWard = kw?.banishOnDeath || (c as any).banishOnDeath;
        if (defLE0 && c.hasWard && !isBanishedOnDeathForWard) {
          fireTrigger("ally_ward_destroyed", owner as any, {
            destroyedCard: c,
          });
        }
      }

      // Strip volatile fields
      delete (c as any).buffs;
      delete (c as any).potential_attack;
      delete (c as any).potential_defense;
      delete (c as any)._death_snapshot;

      const isBanishedOnDeath = kw?.banishOnDeath || (c as any).banishOnDeath;
      if (isBanishedOnDeath) {
        logEvent("banishOnDeath", { card: c.name, owner });
        // banishCard will remove the card from the board
        banishCard(c);
        // PERF: Null-mark instead of splice (if still there)
        if (board[i] === c) (board as any)[i] = null;
      } else {
        logEvent("death", { card: c.name, owner });
        // History: mark as destroyed
        const gameTick = (state as any).gameTick ??
          ((state.roundCount || 0) * 1000 + (state.activePlayer === "first" ? 0 : 500));
        const histEntry = {
          uid: c.uid,
          name: c.name,
          type: cardType,
          cost: Number(c?.cost) || 0,
          base_image: c?.base_image || null,
          ts: gameTick,
          id: c.id,
        };
        getDestroyedHistory(state, owner).push(histEntry as any);

        // PERF: Null-mark BEFORE LWs (preserves "removed before LWs" semantics)
        (board as any)[i] = null;

        const lw = kw?.lastWordsEffects || c.lastWordsEffects;
        const lwCount = Array.isArray(lw) ? lw.length : 0;
        if (lwCount > 0)
          logEvent("lastWords", { card: c.name, owner, count: lwCount });

        // Run LWs and then move to grave
        triggerLastWords(c, owner);
        c.zone = "graveyard";
        c.cost_mod = 0;
        grave.push(c);

        // shadows
        addShadows(state, owner, 1);
      }
    }

    // PERF: Single compaction pass instead of per-element splice
    let w = 0;
    for (let r = 0; r < board.length; r++) {
      const x = board[r];
      if (x && typeof x === "object") {
        board[w++] = x;
      }
    }
    if (w < board.length) {
      board.length = w;
      // PERF: Invalidate candidate cache when zone mutates
      bumpZoneVersion();
    }
  };

  cleanSide(getBoard(state, "first"), getGraveyard(state, "first"), "first");
  cleanSide(getBoard(state, "second"), getGraveyard(state, "second"), "second");
}















