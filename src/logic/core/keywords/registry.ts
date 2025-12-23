export type KeywordName =
  | "rush"
  | "storm"
  | "ward"
  | "bane"
  | "drain"
  | "intimidate"
  | "ambush"
  | "barrier"
  | "banish_on_death"
  | "countdown"
  | "aura"
  | "last_words"
  | "cant_be_destroyed"
  | "trigger"
  | "rally"
  | "fanfare"
  | "strike"
  | "engage"
  | "enhance"
  | "spellboost"
  | "counter"
  | "skybound_art"
  | "pixie_enter"
  | "bleed"
  | "ally_enter"
  | "cant_attack"
  | "max_damage_cap"
  | string;

export const KEYWORD_ALIASES: Record<string, KeywordName> = {
  banishondeath: "banish_on_death",
  lastwords: "last_words",
  "skybound art": "skybound_art",
  pixieenter: "pixie_enter",
  allyenter: "ally_enter",
  maxdamagecap: "max_damage_cap",
  cantattack: "cant_attack",
  "can't attack": "cant_attack",
  cannotbedestroyed: "cant_be_destroyed",
};

export function normalizeKeywordName(raw: string): KeywordName | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();

  // Direct alias lookup
  if (KEYWORD_ALIASES[lower]) {
    return KEYWORD_ALIASES[lower];
  }

  // Default: assume the lowercased string is the intent (or already canonical)
  // We do NOT validate against a "valid keys" set here to allow extensibility ("string" in type),
  // but the consumer (keywords.ts) deals with whether it has a handler.
  // However, we should be consistent.

  return lower;
}
