/**
 * Named-gate discovery and arena preparation for the behaviour harness.
 *
 * Prefer driving reachable branches (satisfy cheap conditions). Conditions we
 * cannot set honestly are reported as unmet → card status `partial`.
 */

import { state } from "../../src/core/gameState.js";
import { createCard } from "../../tests/harness/builders.js";
import type { CardInstance } from "../../src/core/types/index.js";

export type GateSpec = {
  condition: string;
  count?: number;
  cost?: number;
  requirement?: number;
  at_least?: number;
  hasElse: boolean;
  /** Path hint for debugging only */
  where: string;
};

export type GatePrepResult = {
  /** Conditions we successfully arranged to pass */
  satisfied: string[];
  /** Conditions we could not arrange (or deliberately left false) */
  unmet: string[];
  /** Conditions we know how to drive both ways and that have else_effects */
  elseBranches: string[];
};

const PREPARABLE = new Set([
  "combo",
  "overflow",
  "necromancy",
  "rally",
  "pp_at_least",
  "max_pp",
  "both_max_pp",
  "amulet_count",
  "spellboost_count",
  "super_evo_unlocked",
  "evolved_allied",
  "super_evolved_allied",
  "evolved_self",
  "super_evolved_self",
  "highlander",
  "no_ally_attacked",
  "ally_attacked_leader_last_turn",
  "skybound_art",
  "hand_count",
  "hand_count_lte",
  "leader_defense_lte",
  "leader_defense_gt_enemy",
  "has_fuse_materials",
  "fused_this_turn",
]);

export function isPreparableCondition(name: string): boolean {
  return PREPARABLE.has(name);
}

function walkEffects(
  node: unknown,
  visit: (obj: Record<string, unknown>, where: string) => void,
  where = "$",
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkEffects(child, visit, `${where}[${i}]`));
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj, where);
  for (const [key, value] of Object.entries(obj)) {
    walkEffects(value, visit, `${where}.${key}`);
  }
}

/** Collect named `op:"gate"` conditions from a card's effect trees. */
export function collectNamedGates(card: {
  fanfare?: unknown[];
  spell?: unknown[];
  evolve?: unknown[];
  superevolve?: unknown[];
  triggers?: unknown[];
}): GateSpec[] {
  const out: GateSpec[] = [];
  const roots: [string, unknown][] = [
    ["fanfare", card.fanfare],
    ["spell", card.spell],
    ["evolve", card.evolve],
    ["superevolve", card.superevolve],
    ["triggers", card.triggers],
  ];
  for (const [label, root] of roots) {
    walkEffects(root, (obj, where) => {
      if (obj.op !== "gate") return;
      const condition = obj.condition;
      if (typeof condition !== "string" || !condition) return;
      out.push({
        condition,
        count: typeof obj.count === "number" ? obj.count : undefined,
        cost: typeof obj.cost === "number" ? obj.cost : undefined,
        requirement:
          typeof obj.requirement === "number" ? obj.requirement : undefined,
        at_least: typeof obj.at_least === "number" ? obj.at_least : undefined,
        hasElse: Array.isArray(obj.else_effects) && obj.else_effects.length > 0,
        where: `${label}${where.slice(1)}`,
      });
    });
  }
  return out;
}

function uniqConditions(gates: GateSpec[]): string[] {
  return [...new Set(gates.map((g) => g.condition))].sort();
}

/**
 * Arrange player/board state so named gates pass (`mode: "satisfy"`) or fail
 * (`mode: "deny"`) where we know how. Unpreparable conditions are always unmet.
 */
export function applyGatePreparations(
  gates: GateSpec[],
  opts: {
    mode: "satisfy" | "deny";
    /** Card about to be played / evolved — for self / spellboost / fuse / skybound */
    sourceCard?: CardInstance | null;
  },
): GatePrepResult {
  const satisfied: string[] = [];
  const unmet: string[] = [];
  const elseBranches: string[] = [];
  const byCond = new Map<string, GateSpec[]>();
  for (const g of gates) {
    const list = byCond.get(g.condition) ?? [];
    list.push(g);
    byCond.set(g.condition, list);
  }

  const first = state.players.first;
  const second = state.players.second;

  for (const [cond, specs] of [...byCond.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const maxCount = Math.max(0, ...specs.map((s) => s.count ?? 0));
    const maxCost = Math.max(0, ...specs.map((s) => s.cost ?? 0));
    const maxReq = Math.max(0, ...specs.map((s) => s.requirement ?? 0));
    const maxAtLeast = Math.max(0, ...specs.map((s) => s.at_least ?? 0));
    const wantsElse = specs.some((s) => s.hasElse);
    if (wantsElse) elseBranches.push(cond);

    if (!isPreparableCondition(cond)) {
      unmet.push(cond);
      continue;
    }

    const wantPass = opts.mode === "satisfy";

    switch (cond) {
      case "combo": {
        // playCard increments playsThisTurn before fanfare; leave headroom.
        const need = Math.max(1, maxCount || 1);
        first.playsThisTurn = wantPass ? need : 0;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "overflow": {
        first.maxPP = wantPass ? Math.max(first.maxPP, 7) : 6;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "necromancy": {
        const need = Math.max(1, maxCost || 1);
        first.shadows = wantPass ? Math.max(first.shadows, need) : 0;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "rally": {
        const need = Math.max(1, maxCount || 1);
        first.rally = wantPass ? Math.max(first.rally ?? 0, need) : 0;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "pp_at_least": {
        const need = Math.max(1, maxCount || 1);
        first.pp = wantPass ? Math.max(first.pp, need) : Math.min(first.pp, 0);
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "max_pp": {
        const need = Math.max(1, maxAtLeast || 10);
        first.maxPP = wantPass ? Math.max(first.maxPP, need) : need - 1;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "both_max_pp": {
        const need = Math.max(1, maxAtLeast || 10);
        if (wantPass) {
          first.maxPP = Math.max(first.maxPP, need);
          second.maxPP = Math.max(second.maxPP, need);
          satisfied.push(cond);
        } else {
          second.maxPP = Math.min(second.maxPP, need - 1);
          unmet.push(cond);
        }
        break;
      }
      case "amulet_count": {
        const need = Math.max(1, maxCount || 1);
        if (wantPass) {
          while (first.board.filter((c) => c.type === "Amulet").length < need) {
            while (first.board.length >= 5) {
              const idx = first.board.findIndex(
                (c) =>
                  c.type === "Follower" &&
                  String(c.name).startsWith("ArenaAlly"),
              );
              if (idx >= 0) first.board.splice(idx, 1);
              else first.board.pop();
            }
            first.board.push(
              createCard(
                {
                  name: `HarnessAmulet${first.board.length}`,
                  type: "Amulet",
                  cost: 1,
                },
                "board",
                "first",
              ),
            );
          }
          satisfied.push(cond);
        } else {
          first.board = first.board.filter((c) => c.type !== "Amulet");
          unmet.push(cond);
        }
        break;
      }
      case "spellboost_count": {
        const need = Math.max(1, maxCount || 1);
        if (opts.sourceCard) {
          if (wantPass) {
            opts.sourceCard.spellboostCount = need;
            if (opts.sourceCard.keywordState) {
              opts.sourceCard.keywordState.spellboostCount = need;
            } else {
              (opts.sourceCard as any).keywordState = {
                spellboostCount: need,
              };
            }
            satisfied.push(cond);
          } else {
            opts.sourceCard.spellboostCount = 0;
            if (opts.sourceCard.keywordState) {
              opts.sourceCard.keywordState.spellboostCount = 0;
            }
            unmet.push(cond);
          }
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "super_evo_unlocked": {
        // first unlocks at round >= 7
        if (wantPass) {
          state.roundCount = Math.max(state.roundCount, 7);
          satisfied.push(cond);
        } else {
          state.roundCount = Math.min(state.roundCount, 5);
          unmet.push(cond);
        }
        break;
      }
      case "evolved_allied": {
        if (wantPass) {
          // Make room (board cap 5).
          while (first.board.length >= 5) first.board.pop();
          const ally = createCard(
            {
              name: "HarnessEvolvedAlly",
              type: "Follower",
              cost: 2,
              attack: 2,
              defense: 3,
            },
            "board",
            "first",
          );
          ally.hasEvolved = true;
          ally.isEvolved = true;
          ally.evoType = "normal";
          first.board.push(ally);
          satisfied.push(cond);
        } else {
          for (const c of first.board) {
            if (c.type === "Follower") {
              c.hasEvolved = false;
              c.isEvolved = false;
              c.evoType = undefined;
            }
          }
          unmet.push(cond);
        }
        break;
      }
      case "super_evolved_allied": {
        if (wantPass) {
          while (first.board.length >= 5) first.board.pop();
          const ally = createCard(
            {
              name: "HarnessSuperEvoAlly",
              type: "Follower",
              cost: 3,
              attack: 3,
              defense: 4,
            },
            "board",
            "first",
          );
          ally.hasEvolved = true;
          ally.isEvolved = true;
          ally.evoType = "super";
          first.board.push(ally);
          satisfied.push(cond);
        } else {
          for (const c of first.board) {
            if (c.type === "Follower" && c.evoType === "super") {
              c.evoType = undefined;
              c.hasEvolved = false;
            }
          }
          unmet.push(cond);
        }
        break;
      }
      case "evolved_self":
      case "super_evolved_self": {
        if (opts.sourceCard && opts.sourceCard.type === "Follower") {
          if (wantPass) {
            opts.sourceCard.hasEvolved = true;
            opts.sourceCard.isEvolved = true;
            opts.sourceCard.evoType =
              cond === "super_evolved_self" ? "super" : "normal";
            satisfied.push(cond);
          } else {
            opts.sourceCard.hasEvolved = false;
            opts.sourceCard.isEvolved = false;
            opts.sourceCard.evoType = undefined;
            unmet.push(cond);
          }
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "highlander": {
        // Filler decks use unique PadF/PadS names — already highlander.
        // Deny by duplicating a deck name.
        if (wantPass) {
          satisfied.push(cond);
        } else if (first.deck.length >= 2) {
          first.deck[1]!.name = first.deck[0]!.name;
          unmet.push(cond);
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "no_ally_attacked": {
        first.anyAllyAttackedThisTurn = !wantPass;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "ally_attacked_leader_last_turn": {
        first.allyAttackedLeaderLastTurn = wantPass;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "skybound_art": {
        const req = Math.max(1, maxReq || 10);
        if (wantPass) {
          // gauge = roundCount + witnesses
          state.roundCount = Math.max(state.roundCount, req);
          if (opts.sourceCard) {
            (opts.sourceCard as any).skyboundArtEvolvesWitnessed = 0;
          }
          satisfied.push(cond);
        } else {
          state.roundCount = 1;
          if (opts.sourceCard) {
            (opts.sourceCard as any).skyboundArtEvolvesWitnessed = 0;
          }
          unmet.push(cond);
        }
        break;
      }
      case "hand_count": {
        const need = Math.max(1, maxCount || 1);
        if (wantPass) {
          while (first.hand.length < need) {
            first.hand.push(
              createCard(
                {
                  name: `HarnessHandPad${first.hand.length}`,
                  type: "Follower",
                  cost: 1,
                  attack: 1,
                  defense: 1,
                },
                "hand",
                "first",
              ),
            );
          }
          satisfied.push(cond);
        } else {
          first.hand = first.hand.slice(0, Math.max(0, need - 1));
          unmet.push(cond);
        }
        break;
      }
      case "hand_count_lte": {
        const max = Math.max(0, maxCount || 5);
        if (wantPass) {
          first.hand = first.hand.slice(0, max);
          satisfied.push(cond);
        } else {
          while (first.hand.length <= max) {
            first.hand.push(
              createCard(
                {
                  name: `HarnessHandOver${first.hand.length}`,
                  type: "Spell",
                  cost: 1,
                },
                "hand",
                "first",
              ),
            );
          }
          unmet.push(cond);
        }
        break;
      }
      case "leader_defense_lte": {
        const need = Math.max(0, maxCount || 10);
        first.hp = wantPass ? Math.min(first.hp, need) : need + 5;
        if (wantPass) satisfied.push(cond);
        else unmet.push(cond);
        break;
      }
      case "leader_defense_gt_enemy": {
        if (wantPass) {
          first.hp = Math.max(first.hp, second.hp + 1);
          satisfied.push(cond);
        } else {
          first.hp = Math.min(first.hp, second.hp);
          unmet.push(cond);
        }
        break;
      }
      case "has_fuse_materials":
      case "fused_this_turn": {
        if (opts.sourceCard) {
          if (wantPass) {
            (opts.sourceCard as any).isFused = true;
            (opts.sourceCard as any)._fusedLootNames = ["HarnessLoot"];
            satisfied.push(cond);
          } else {
            (opts.sourceCard as any).isFused = false;
            delete (opts.sourceCard as any)._fusedLootNames;
            unmet.push(cond);
          }
        } else {
          unmet.push(cond);
        }
        break;
      }
      default:
        unmet.push(cond);
    }
  }

  return {
    satisfied: [...new Set(satisfied)].sort(),
    unmet: [...new Set(unmet)].sort(),
    elseBranches: [...new Set(elseBranches)].sort(),
  };
}

export function summarizeGateConditions(gates: GateSpec[]): {
  all: string[];
  preparable: string[];
  unpreparable: string[];
  withElse: string[];
} {
  const all = uniqConditions(gates);
  return {
    all,
    preparable: all.filter(isPreparableCondition),
    unpreparable: all.filter((c) => !isPreparableCondition(c)),
    withElse: [
      ...new Set(gates.filter((g) => g.hasElse).map((g) => g.condition)),
    ].sort(),
  };
}
