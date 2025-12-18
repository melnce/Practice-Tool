// src/logic/effects/ops/damage/types.ts
// Shared types for the damage module.

import { Effect, Player, CardInstance } from "../../../../core/types.js";

export type DamageOp = Effect & {
    amount?: number | string;
    add_amount?: number | string;
    amount_overflow?: number | string;
    overflow_amount?: number | string;
    target?: string;
    select?: number | string;
    count?: number | string;
    can_target_leader?: boolean;
};

export interface DamageContext {
    owner: Player;
    sourceCard: CardInstance | null;
    effectsQueue?: Effect[];
    defender?: CardInstance;
    targets?: CardInstance[];
    selectedCard?: CardInstance;
    [key: string]: any;
}
