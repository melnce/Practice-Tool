// =============================================================================
// CARD TYPES
// =============================================================================

import type { KeywordState } from "../../logic/core/keywords/types.js";
import type { Effect } from "./effects.js";
import type { Player } from "./player.js";

export interface KeywordEntry {
  name: string;
  cost?: number;
  effects?: Effect[];
  key?: string;
  count?: number;
  reduceCostBy?: number;
  minCost?: number;
  destroyOnEmpty?: boolean;
  turns?: string | number; // for countdown
  [key: string]: any;
}

export interface CardTemplate {
  id: string; // Unique Identifier (e.g. "10001110")
  uid: string;
  name: string;
  type: "Follower" | "Amulet" | "Spell" | string;
  class?: string;
  tribes?: string[];
  description?: string;
  base_image?: string;
  image?: string;
  evo_image?: string;
  cost: number | string;
  base_cost?: number | string;
  // Stats
  attack?: number | string;
  defense?: number | string;
  base_attack?: number | string;
  base_defense?: number | string;
  // Flags
  can_attack?: boolean;
  hasAttacked?: boolean;
  justPlayed?: boolean;
  hasRush?: boolean;
  isRush?: boolean;
  hasWard?: boolean;
  hasIntimidate?: boolean;
  hasBane?: boolean;
  hasLastWords?: boolean;
  hasEvolved?: boolean;
  hasCountdown?: boolean;
  hasEngage?: boolean;
  hasStorm?: boolean;
  cant_play?: boolean;
  // Spell/Amulet specific
  spell?: Effect[];
  fuse?: any[];
  fuse_recipes?: any[];
  // Combat / Runtime
  attacks_left?: number;
  attacks_per_turn?: number;
  attacks_used_this_turn?: number;
  triggers?: any[];
  // Runtime-like (template might not have them but they appear)
  cost_mod?: number;
  effectiveCost?: number;
  potential_attack?: number;
  potential_defense?: number;
  countdown?: number | string;
  peak_defense?: number;
  counters?: Record<string, number>;
  keywords?: (string | KeywordEntry)[];
  fanfare?: Effect[];
  enhanceTiers?: { cost: number; effects?: Effect[] }[];
  evoType?: "normal" | "super";
  evolve?: Effect[] | { effects: Effect[] };
  superevolve?: Effect[] | { effects: Effect[] };
  /** When true, super-evolve fires superevolve[] only (replaces Evolve line). */
  superEvolveReplaces?: boolean;
  /**
   * Card text "When this follower evolves" — entire evolve[] runs on effect-granted
   * evolves, not only on player EP. Distinct from plain "Evolve:" lines (82 cards).
   */
  evolve_trigger_always?: boolean;
  lastWordsEffects?: Effect[];
  /**
   * Derived at index build from description + ops (not stored in set JSON).
   * See src/data/cardImplementationStatus.ts.
   */
  implementationStatus?: "implemented" | "partial" | "unimplemented";
  // Buff tracking
  buffs?:
    | {
        attack?: number | undefined;
        defense?: number | undefined;
        [key: string]: any;
      }
    | undefined;
  [key: string]: any;
}

export interface CardInstance extends CardTemplate {
  owner?: Player;
  zone?: "deck" | "hand" | "board" | "graveyard" | "banished";
  instanceId?: string | number;
  originalCost?: number;
  // Runtime counters
  spellboostCount?: number;
  keywordState?: KeywordState;
  // UI
  __uiFlashBarrier?: boolean;
  __uiPopBarrier?: boolean;
  __uiSelectable?: boolean;
  __mulliganSelectable?: boolean;
  __mulliganSelected?: boolean;
  __icarusBuff?: boolean;
  _spawnedByChain?: boolean;
  _spawnedByCongregant?: boolean;
  isDamaged?: boolean;
  shownCost?: number; // UI preview cost

  // P1-3 FIX: Insertion timestamp for deterministic trigger ordering
  insertionTs?: number;

  // Fuse
  _fusedLootNames?: string[];
  __lootFuseTurn?: number;
  __lootFuseCount?: number;
  lastFuseRound?: number;
  isFused?: boolean;

  // Phase 3: Unified once-per-turn tracking store
  __onceByTurn?: Record<string, number>;

  // Legacy / loose props (migrating slowly)
  on_discard?: Effect[];
}
