// src/logic/effects/ops/countdown/types.ts
// Types for unified countdown operation

import { Effect } from "../../../../core/types/index.js";

export type CountdownAction = "advance" | "increase";

export interface CountdownSpec {
    op: "countdown";
    action: CountdownAction;
    amount?: number;
    target?: "self" | string;
    name?: string; // For crest targeting by name
}

/**
 * Normalize legacy op names to unified countdown spec
 */
export function normalizeCountdownSpec(eff: Effect): CountdownSpec | null {
    const op = (eff as any).op;

    // Already unified
    if (op === "countdown") {
        return {
            op: "countdown",
            action: (eff as any).action === "increase" || (eff as any).action === "delay_countdown"
                ? "increase"
                : "advance",
            amount: (eff as any).amount,
            target: (eff as any).target,
            name: (eff as any).name,
        };
    }

    // Legacy amulet ops
    if (op === "amulet") {
        const action = (eff as any).action;
        if (action === "reduce_countdown" || action === "advance_countdown") {
            return {
                op: "countdown",
                action: "advance",
                amount: (eff as any).amount,
                target: "self",
            };
        }
        if (action === "delay_countdown") {
            return {
                op: "countdown",
                action: "increase",
                amount: (eff as any).amount,
                target: "self",
            };
        }
    }

    // Legacy crest countdown ops
    if (op === "crest") {
        const action = (eff as any).action;
        if (action === "advance_countdown") {
            return {
                op: "countdown",
                action: "advance",
                amount: (eff as any).amount,
                target: (eff as any).target,
                name: (eff as any).name,
            };
        }
        if (action === "delay_countdown") {
            return {
                op: "countdown",
                action: "increase",
                amount: (eff as any).amount,
                target: (eff as any).target,
                name: (eff as any).name,
            };
        }
    }

    return null;
}















