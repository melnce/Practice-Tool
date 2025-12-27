import type { CardInstance } from "../../../core/types/index.js";
import type { KeywordState } from "./types.js";

// Helper to access or initialize keyword state
// Single source of truth for keywordState retrieval vs creation
export function getKS(c: CardInstance): KeywordState {
  if (!c.keywordState) c.keywordState = {};
  return c.keywordState;
}















