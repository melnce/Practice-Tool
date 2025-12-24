// src/ui/zones/types.ts
import { CardInstance, Player } from "../../core/types.js";

export type ZoneId = "blueHand" | "redHand" | "blueBoard" | "redBoard";

export interface ZoneContext {
  containerId: string;
  owner: Player;
  isBoard: boolean;
  isHand: boolean;
  isMyBoard: boolean;
  isMyHand: boolean;
  isBlueHand: boolean;
  isRedHand: boolean;
  isBlueBoard: boolean;
  isRedBoard: boolean;
  isMulligan: boolean;
}

export interface CardViewModel {
  card: CardInstance;
  idx: number; // Index in zone
  uid: string;

  // Display stats
  shownCost: number;
  atkDisp: number;
  defDisp: number;

  // Visual states
  glowClass?: string | undefined;

  // Status Flags (Granular)
  isDamaged?: boolean | undefined;
  isBuffed?: boolean | undefined;
  isDebuffed?: boolean | undefined;

  isAtkBuffed?: boolean | undefined;
  isAtkDebuffed?: boolean | undefined;
  isDefBuffed?: boolean | undefined;

  isEvo?: boolean | undefined;
  isSuperEvo?: boolean | undefined;
  isSpell?: boolean | undefined;
  hasWard?: boolean | undefined;

  // Counters/Badges
  spellboostCount: number | null;
  countdown: number | null;
  icarusBuff?: boolean | undefined;

  // Interaction states
  canAttack?: boolean | undefined;
  isRush?: boolean | undefined;
  canEngage?: boolean | undefined;
  engageCost?: number | undefined;

  // Selection
  isSelected?: boolean | undefined;
  isSelectable?: boolean | undefined;
  isMulliganSelected?: boolean | undefined;
}














