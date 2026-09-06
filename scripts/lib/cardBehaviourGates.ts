/**
 * Named-gate discovery and arena preparation for the behaviour harness.
 *
 * Prefer driving reachable branches (satisfy cheap conditions). Conditions we
 * cannot set honestly are reported as unmet → card status `partial`.
 */

import { state } from "../../src/core/gameState.js";
import { createCard } from "../../tests/harness/builders.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { DEFAULT_FULL_COST_LADDER } from "../../src/logic/core/playedBaseCostHistory.js";

export type GateSpec = {
  condition: string;
  count?: number;
  cost?: number;
  requirement?: number;
  at_least?: number;
  hasElse: boolean;
  /** Named gate fields used by board/ally/hand matchers */
  name?: string;
  type?: string;
  tribe?: string;
  base_cost_eq?: number;
  base_cost_gte?: number;
  base_cost_lte?: number;
  has_keyword?: string;
  exclude_self?: boolean;
  is_ally?: boolean;
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
  "self_cost",
  "board_name",
  "ally_matches",
  "field_matches",
  "selected_matches",
  "unique_tribe_enters",
  "named_enter_count",
  "hand_matches",
  "last_discarded_type",
  "hand_same_cost_gte",
  "hand_top_base_costs_gt_enemy",
  "played_base_cost_ladder",
]);

/** Max followers/amulets per side — harness must never exceed this after prep. */
export const HARNESS_BOARD_CAP = 5;

/** Leave one slot when the driven card will occupy the allied board. */
export const HARNESS_BOARD_RESERVE = 1;

export function trimBoardToCap(board: CardInstance[], maxLen: number): void {
  while (board.length > maxLen) {
    const idx = board.findIndex(
      (c) => c.type === "Follower" && String(c.name).startsWith("ArenaAlly"),
    );
    if (idx >= 0) board.splice(idx, 1);
    else board.pop();
  }
}

export function assertHarnessBoardCap(context: string): void {
  for (const side of ["first", "second"] as const) {
    const len = state.players[side].board.length;
    if (len > HARNESS_BOARD_CAP) {
      throw new Error(
        `Harness board cap exceeded for ${side}: ${len} > ${HARNESS_BOARD_CAP} (${context})`,
      );
    }
  }
}

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
        name: typeof obj.name === "string" ? obj.name : undefined,
        type: typeof obj.type === "string" ? obj.type : undefined,
        tribe: typeof obj.tribe === "string" ? obj.tribe : undefined,
        base_cost_eq:
          typeof obj.base_cost_eq === "number" ? obj.base_cost_eq : undefined,
        base_cost_gte:
          typeof obj.base_cost_gte === "number" ? obj.base_cost_gte : undefined,
        base_cost_lte:
          typeof obj.base_cost_lte === "number" ? obj.base_cost_lte : undefined,
        has_keyword:
          typeof obj.has_keyword === "string" ? obj.has_keyword : undefined,
        exclude_self: obj.exclude_self === true,
        is_ally: typeof obj.is_ally === "boolean" ? obj.is_ally : undefined,
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
        const maxBeforePlay = HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE;
        if (wantPass) {
          while (first.board.filter((c) => c.type === "Amulet").length < need) {
            trimBoardToCap(first.board, maxBeforePlay - 1);
            first.board.push(
              createCard(
                {
                  name: `HarnessAmulet${first.board.filter((c) => c.type === "Amulet").length + 1}`,
                  type: "Amulet",
                  cost: 1,
                },
                "board",
                "first",
              ),
            );
          }
          trimBoardToCap(first.board, maxBeforePlay);
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
      case "self_cost": {
        const targetCost = Math.max(0, maxCost || 0);
        if (opts.sourceCard) {
          if (wantPass) {
            (opts.sourceCard as any).cost = targetCost;
            (opts.sourceCard as any).effectiveCost = targetCost;
            (opts.sourceCard as any).base_cost = targetCost;
            satisfied.push(cond);
          } else {
            (opts.sourceCard as any).cost = 0;
            (opts.sourceCard as any).effectiveCost = 0;
            unmet.push(cond);
          }
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "board_name": {
        const want = String(specs.find((s) => s.name)?.name ?? "").trim();
        if (!want) {
          unmet.push(cond);
          break;
        }
        if (wantPass) {
          trimBoardToCap(
            first.board,
            HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
          );
          if (!first.board.some((c) => String(c.name) === want)) {
            first.board.push(
              createCard(
                {
                  name: want,
                  type: "Follower",
                  cost: 2,
                  attack: 1,
                  defense: 1,
                },
                "board",
                "first",
              ),
            );
          }
          satisfied.push(cond);
        } else {
          first.board = first.board.filter((c) => String(c.name) !== want);
          unmet.push(cond);
        }
        break;
      }
      case "ally_matches": {
        const spec = specs[0];
        const need = Math.max(1, maxCount || 1);
        const countMatches = () =>
          first.board.filter((c) => {
            if (spec?.type && spec.type !== "Card") {
              if (
                String(c.type).toLowerCase() !== String(spec.type).toLowerCase()
              )
                return false;
            }
            if (spec?.base_cost_gte != null) {
              const bc =
                (c as any).base_cost !== undefined
                  ? Number((c as any).base_cost)
                  : Number(c.cost) || 0;
              if (bc < spec.base_cost_gte) return false;
            }
            if (spec?.has_keyword) {
              const kws = (c as any).keywords ?? [];
              const hasKw = kws.some(
                (k: unknown) =>
                  k === spec.has_keyword ||
                  (k &&
                    typeof k === "object" &&
                    (k as { name?: string }).name === spec.has_keyword),
              );
              if (!hasKw && !(c as any)[`has${spec.has_keyword}`]) return false;
            }
            return true;
          }).length;
        if (wantPass) {
          while (countMatches() < need) {
            trimBoardToCap(
              first.board,
              HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
            );
            const cardSpec: Record<string, unknown> = {
              name: `HarnessAllyMatch${countMatches() + 1}`,
              type: spec?.type && spec.type !== "Card" ? spec.type : "Follower",
              cost: spec?.base_cost_gte ?? spec?.base_cost_eq ?? 2,
              attack: 1,
              defense: 1,
            };
            if (spec?.base_cost_gte != null) {
              cardSpec.cost = spec.base_cost_gte;
              cardSpec.base_cost = spec.base_cost_gte;
            }
            if (spec?.base_cost_eq != null) {
              cardSpec.cost = spec.base_cost_eq;
              cardSpec.base_cost = spec.base_cost_eq;
            }
            if (spec?.name) cardSpec.name = spec.name;
            if (spec?.tribe) cardSpec.tribes = [spec.tribe];
            const ally = createCard(cardSpec as any, "board", "first");
            if (spec?.has_keyword) {
              (ally as any).keywords = [spec.has_keyword];
              if (spec.has_keyword === "LastWords") ally.hasLastWords = true;
            }
            first.board.push(ally);
          }
          satisfied.push(cond);
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "field_matches": {
        const spec = specs[0];
        const need = Math.max(1, maxCount || 1);
        if (wantPass) {
          const field = [...first.board, ...second.board];
          let matches = field.filter((c) => {
            if (
              spec?.exclude_self &&
              opts.sourceCard &&
              c.uid === opts.sourceCard.uid
            )
              return false;
            if (spec?.base_cost_eq != null) {
              const bc =
                (c as any).base_cost !== undefined
                  ? Number((c as any).base_cost)
                  : Number(c.cost) || 0;
              return bc === spec.base_cost_eq;
            }
            return true;
          }).length;
          while (matches < need) {
            trimBoardToCap(second.board, HARNESS_BOARD_CAP);
            const cardSpec: Record<string, unknown> = {
              name: `HarnessFieldMatch${matches + 1}`,
              type: spec?.type && spec.type !== "Card" ? spec.type : "Follower",
              cost: spec?.base_cost_eq ?? 1,
              attack: 1,
              defense: 1,
            };
            if (spec?.base_cost_eq != null) {
              cardSpec.base_cost = spec.base_cost_eq;
            }
            second.board.push(createCard(cardSpec as any, "board", "second"));
            matches++;
          }
          satisfied.push(cond);
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "selected_matches": {
        if (wantPass) {
          trimBoardToCap(
            first.board,
            HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
          );
          const spec = specs[0];
          const ally = createCard(
            {
              name: "HarnessSelectAmulet",
              type: spec?.type === "Amulet" ? "Amulet" : "Follower",
              cost: 1,
            },
            "board",
            "first",
          );
          first.board.unshift(ally);
          satisfied.push(cond);
        } else {
          first.board = first.board.filter(
            (c) => String(c.name) !== "HarnessSelectAmulet",
          );
          unmet.push(cond);
        }
        break;
      }
      case "unique_tribe_enters": {
        const tribe = String(specs[0]?.tribe || "Artifact");
        const need = Math.max(1, maxCount || 1);
        if (wantPass) {
          if (!first.followerEnterHistory) first.followerEnterHistory = [];
          const names = [
            "HarnessTribeA",
            "HarnessTribeB",
            "HarnessTribeC",
            "HarnessTribeD",
          ];
          for (let i = 0; i < need; i++) {
            first.followerEnterHistory.push({
              name: names[i] ?? `HarnessTribe${i}`,
              tribes: [tribe],
              cardId: `harness_tribe_${i}`,
            });
          }
          satisfied.push(cond);
        } else {
          first.followerEnterHistory = [];
          unmet.push(cond);
        }
        break;
      }
      case "named_enter_count": {
        const name = String(specs[0]?.name ?? opts.sourceCard?.name ?? "");
        const need = Math.max(1, maxCount || 1);
        const excludeSelf = specs.some((s) => s.exclude_self);
        if (wantPass && name) {
          if (!first.followerEnterHistory) first.followerEnterHistory = [];
          const entries = excludeSelf ? need : need;
          for (let i = 0; i < entries; i++) {
            first.followerEnterHistory.push({
              name,
              tribes: [],
              cardId: `harness_named_${i}`,
            });
          }
          satisfied.push(cond);
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "hand_matches": {
        const spec = specs[0];
        const need = Math.max(1, maxCount || 1);
        if (wantPass) {
          const filterType = spec?.type ?? "Follower";
          let have = first.hand.filter(
            (c) =>
              String(c.type).toLowerCase() === String(filterType).toLowerCase(),
          ).length;
          while (have < need) {
            first.hand.push(
              createCard(
                {
                  name: `HarnessHandMatch${have + 1}`,
                  type: filterType,
                  cost: 1,
                },
                "hand",
                "first",
              ),
            );
            have++;
          }
          satisfied.push(cond);
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "last_discarded_type": {
        const wantType = String(specs[0]?.type ?? "Spell");
        if (wantPass) {
          (state as any).lastDiscardedType = wantType;
          satisfied.push(cond);
        } else {
          (state as any).lastDiscardedType =
            wantType === "Spell" ? "Follower" : "Spell";
          unmet.push(cond);
        }
        break;
      }
      case "hand_same_cost_gte": {
        const need = Math.max(1, maxCount || 4);
        if (wantPass) {
          const sharedCost = 2;
          let have = first.hand.filter(
            (c) => Number(c.cost) === sharedCost,
          ).length;
          while (have < need) {
            first.hand.push(
              createCard(
                {
                  name: `HarnessSameCost${have + 1}`,
                  type: "Follower",
                  cost: sharedCost,
                },
                "hand",
                "first",
              ),
            );
            have++;
          }
          satisfied.push(cond);
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "hand_top_base_costs_gt_enemy": {
        const n = Math.max(1, maxCount || 3);
        if (wantPass) {
          first.hand = [];
          for (let i = 0; i < n; i++) {
            const c = createCard(
              {
                name: `HarnessHighTop${i + 1}`,
                type: "Follower",
                cost: 8 - i,
              },
              "hand",
              "first",
            );
            (c as any).base_cost = 8 - i;
            first.hand.push(c);
          }
          second.hand = [
            createCard(
              { name: "HarnessLowEnemy", type: "Follower", cost: 1 },
              "hand",
              "second",
            ),
          ];
          satisfied.push(cond);
        } else {
          unmet.push(cond);
        }
        break;
      }
      case "played_base_cost_ladder": {
        if (wantPass) {
          for (const cost of DEFAULT_FULL_COST_LADDER) {
            if (!first.playedBaseCostsThisMatch.includes(cost)) {
              first.playedBaseCostsThisMatch.push(cost);
            }
          }
          first.playedBaseCostsThisMatch.sort((a, b) => a - b);
          satisfied.push(cond);
        } else {
          first.playedBaseCostsThisMatch = [];
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
