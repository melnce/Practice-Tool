
import { COMBAT_OPS } from "./domains/combatOps.js";
import { RESOURCE_OPS } from "./domains/resourcesOps.js";
import { BOARD_OPS } from "./domains/boardOps.js";
import { BUFF_OPS } from "./domains/buffsOps.js";
import { MISC_OPS } from "./domains/miscOps.js";

// Aggregate all OPS
export const ALL_OPS = [
    ...COMBAT_OPS,
    ...RESOURCE_OPS,
    ...BOARD_OPS,
    ...BUFF_OPS,
    ...MISC_OPS
] as const;

export type EffectOp = typeof ALL_OPS[number];

export function isValidOp(op: string): op is EffectOp {
    return (ALL_OPS as readonly string[]).includes(op);
}
