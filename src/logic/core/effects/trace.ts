import { EffectOp } from "../../../core/types.js";

// --- Types ---
export type EffectTraceEvent =
    | { kind: "dispatch_start"; queueSize: number }
    | { kind: "effect_start"; op: EffectOp; depth: number }
    | { kind: "effect_end"; op: EffectOp }
    | { kind: "effect_pending"; op: EffectOp }
    | { kind: "dispatch_end"; processed: number; remaining: number };

export interface EffectTraceSink {
    emit(event: EffectTraceEvent): void;
}

// --- Dev Utility (not for production use) ---
export function createArrayTrace(): { sink: EffectTraceSink; events: EffectTraceEvent[] } {
    const events: EffectTraceEvent[] = [];
    return {
        events,
        sink: {
            emit(e) {
                events.push(e);
            }
        }
    };
}

// Global Trace Context (for injection where arguments cannot be passed)
let globalTrace: EffectTraceSink | undefined;

export function setGlobalTrace(sink: EffectTraceSink | undefined) {
    globalTrace = sink;
}

export function getGlobalTrace(): EffectTraceSink | undefined {
    return globalTrace;
}
