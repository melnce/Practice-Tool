/**
 * L2 test helpers — raise triggers through real engine dispatch paths.
 */
import { state } from "../../src/core/gameState.js";
import type { CardInstance, PlayerSlot } from "../../src/core/types/index.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { whenPlayCard, whenRunEffects } from "./builders.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

/** Resolve a target click only when the engine has an open prompt. */
export function resolveOpenPendingTarget(uid: string | "leader"): void {
  if (!state.pendingTargetEffect) return;
  resolvePendingTarget(uid);
}

/** Cheap neutral follower for real ally_follower_enter via play path. */
export const PLAY_FILLER_FOLLOWER = "10001110";

export function boardUidSet(player: PlayerSlot): Set<string> {
  return new Set(getBoard(state, player).map((c) => c.uid));
}

export function newBoardCardsSince(
  before: Set<string>,
  player: PlayerSlot,
  filter?: (c: CardInstance) => boolean,
): CardInstance[] {
  return getBoard(state, player).filter(
    (c) => !before.has(c.uid) && (!filter || filter(c)),
  );
}

/** Direct stat tweak for test setup (does not fire self_buffed triggers). */
export function giveStatBuff(card: CardInstance, atk = 0, def = 0): void {
  if (atk) card.attack = Number(card.attack) + atk;
  if (def) {
    card.defense = Number(card.defense) + def;
    if (card.peak_defense != null) {
      card.peak_defense = Number(card.peak_defense) + def;
    }
  }
}

/** Give +atk/+def through the stat op so self_buffed_up triggers fire. */
export function giveStatBuffViaEngine(
  card: CardInstance,
  owner: PlayerSlot,
  atk = 0,
  def = 0,
): void {
  whenRunEffects(
    [
      {
        op: "stat",
        action: "give",
        target: "self",
        attack: atk,
        defense: def,
      },
    ],
    owner,
    card,
  );
}

export function killFollowerForLastWords(
  card: CardInstance,
  _owner: PlayerSlot,
): void {
  card.defense = 0;
  cleanupDead();
  flushDeferredDeathBatch();
}

export function destroyCardForLastWords(
  card: CardInstance,
  owner: PlayerSlot,
): void {
  destroyTarget(card, owner);
  cleanupDead();
  flushDeferredDeathBatch();
}

export function expireCountdownForLastWords(
  amulet: CardInstance,
  _owner: PlayerSlot,
): void {
  amulet.countdown = 0;
  cleanupDead();
  flushDeferredDeathBatch();
}

/** Summon a named DB follower through pushToBoard / finishFollowerEnter. */
export function summonFollowerByCardId(
  cardId: string,
  owner: PlayerSlot,
): CardInstance {
  const template = getCardById(cardId);
  if (!template) throw new Error(`[l2Dispatch] Card not found: ${cardId}`);
  const before = boardUidSet(owner);
  summonNamed(
    { op: "summon", source: "named", name: template.name, count: 1 },
    owner,
  );
  const newcomers = newBoardCardsSince(before, owner, (c) => c.id === cardId);
  if (newcomers.length !== 1) {
    throw new Error(
      `[l2Dispatch] Expected 1 new ${template.name} on ${owner}, got ${newcomers.length}`,
    );
  }
  return newcomers[0]!;
}

/** Play a follower from hand; returns the new board instance by uid diff. */
export function playFollowerFromHandById(
  player: PlayerSlot,
  cardId: string,
): CardInstance {
  const before = boardUidSet(player);
  const handIdx = getHand(state, player).findIndex((c) => c.id === cardId);
  if (handIdx < 0) {
    throw new Error(`[l2Dispatch] Card ${cardId} not in ${player} hand`);
  }
  whenPlayCard(player, handIdx);
  const newcomers = newBoardCardsSince(before, player, (c) => c.id === cardId);
  if (newcomers.length !== 1) {
    throw new Error(
      `[l2Dispatch] Expected 1 new board card for ${cardId}, got ${newcomers.length}`,
    );
  }
  return newcomers[0]!;
}
