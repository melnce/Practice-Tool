// src/logic/core/targeting/types.ts
import { CardInstance, Effect, Player } from "../../../core/types.js";

/** 
 * Context required to execute a targeted operation.
 * Minimal subset of state required by handlers.
 */
export interface TargetedOpContext {
    eff: Effect;
    owner: Player;
    sourceCard: CardInstance | null;
    targets: CardInstance[];
    resumeEffects: Effect[];
}

/**
 * Result of the targeting engine processing a click.
 */
export type TargetingResult =
    | { kind: "invalid"; reason?: string | undefined }
    | { kind: "continue" }              // Selection updated, but not finished
    | { kind: "confirm_needed" }        // Valid selection, waiting for UI confirmation
    | { kind: "execute"; opCtx: TargetedOpContext }; // Selection complete, ready to execute

/**
 * Result of dispatching a targeted operation.
 * Enforces the contract between Handlers and Orchestrator.
 */
export type DispatchResult =
    | { kind: "handled" } // Op executed state changes. Orchestrator MUST perform cleanup/resume/render.
    | { kind: "paused" }; // Op requested pause (e.g. async flow). Orchestrator MUST NOT cleanup.
