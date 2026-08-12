/**
 * Web Worker entry for consistency Monte Carlo.
 * Receives a pre-resolved deck (no card DB / no engine) and runs runConsistency.
 */
import { runConsistency } from "./monteCarlo.js";
import type {
  Condition,
  ConsistencyConfig,
  ConsistencyResult,
  SimCard,
} from "./types.js";

export interface ConsistencyWorkerRequest {
  type: "run";
  deck: SimCard[];
  condition: Condition;
  config: ConsistencyConfig;
}

export type ConsistencyWorkerResponse =
  | { type: "result"; result: ConsistencyResult }
  | { type: "error"; message: string };

self.onmessage = (ev: MessageEvent<ConsistencyWorkerRequest>) => {
  const msg = ev.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = runConsistency(msg.deck, msg.condition, msg.config);
    const response: ConsistencyWorkerResponse = { type: "result", result };
    self.postMessage(response);
  } catch (e) {
    const response: ConsistencyWorkerResponse = {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(response);
  }
};
