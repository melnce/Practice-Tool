// src/logic/effects/ops/keyword/types.ts
// Keyword operation types - handles keyword grant, remove, silence, grant_trigger

export type KeywordAction = "grant" | "remove" | "silence" | "grant_trigger";

export interface UnifiedKeywordSpec {
  op: "keyword";
  action: KeywordAction;
  keywords?: (string | { name: string; [key: string]: any })[];
  trigger?: any; // For action: "grant_trigger"
  target?: string;
  select?: number | string;
  select_count?: number;
  condition?: any;
  filters?: { class?: string; type?: string; tribe?: string };
  exclude_self?: boolean;
  until_end_of_turn?: boolean;
  name_filter?: string;
}















