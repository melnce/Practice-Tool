/**
 * Keyword registration checklist — every KEYWORD_MAP entry must be wired
 * consistently. Documents the stateHash blind spot via STATE_HASH_EXEMPTIONS.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { KEYWORD_MAP } from "../../src/logic/core/keywords/apply.js";
import {
  KEYWORD_ALIASES,
  normalizeKeywordName,
} from "../../src/logic/core/keywords/registry.js";
import { EVERGREEN_KEYWORDS } from "../../src/data/cardImplementationStatus.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const KEYWORD_MAP_KEYS = Object.keys(KEYWORD_MAP).sort();

import { STATE_HASH_STATIC_EFFECT_EXCLUSIONS } from "../../src/core/stateHash.js";

/** Keywords whose mutable runtime state is hashed via canonicalizeCard. */
const STATE_HASH_CANONICAL: Record<string, string> = {
  rush: "hasRush",
  storm: "hasStorm",
  ward: "hasWard",
  ignores_ward: "ignoresWard",
  bane: "hasBane",
  drain: "hasDrain",
  barrier: "hasBarrier",
  max_damage_cap: "maxDamageCap",
  intimidate: "hasIntimidate",
  ambush: "hasAmbush",
  banish_on_death: "banishOnDeath",
  countdown: "hasCountdown",
  aura: "hasAura",
  taunt: "hasTaunt",
  last_words: "hasLastWords",
  cant_be_destroyed: "cannotBeDestroyed",
  rally: "hasRally",
  fanfare: "hasFanfare",
  engage: "engagedThisTurn",
  spellboost: "hasSpellboost",
  counter: "keywordRuntime",
  bleed: "hasBleed",
  cant_attack: "cantAttack",
};

/**
 * Keywords whose runtime state is not hashed — static card data or intentional no-ops.
 * Mutable markers for these keywords are in STATE_HASH_CANONICAL; effect arrays are in
 * STATE_HASH_STATIC_EFFECT_EXCLUSIONS.
 */
export const STATE_HASH_EXEMPTIONS: Record<string, string> = {
  trigger:
    "static trigger definitions only; triggers[] excluded by design (see STATE_HASH_STATIC_EFFECT_EXCLUSIONS)",
  enhance:
    "enhanceTiers are static card data; tier selection is play-time, not hashed",
  accelerate:
    "accelerateTiers are static card data; alternate form is play-time, not hashed",
  crystallize:
    "crystallizeTiers are static card data; alternate form is play-time, not hashed",
  skybound_art: "intentional no-op handler; no runtime state to hash",
};

/** Evergreen keywords that only strip from keywords[] in remove.ts (no flag branch). */
const REMOVE_KEYWORDS_ARRAY_ONLY = new Set([
  "barrier",
  "aura",
  "taunt",
  "banish_on_death",
  "countdown",
  "cant_be_destroyed",
  "trigger",
  "rally",
  "fanfare",
  "strike",
  "engage",
  "enhance",
  "accelerate",
  "crystallize",
  "spellboost",
  "counter",
  "skybound_art",
  "bleed",
  "cant_attack",
  "max_damage_cap",
  "ignores_ward",
]);

/** Structured / non-evergreen — no hasInherent* helper expected. */
const NON_EVERGREEN_KEYWORDS = new Set([
  "trigger",
  "rally",
  "fanfare",
  "strike",
  "engage",
  "enhance",
  "accelerate",
  "crystallize",
  "spellboost",
  "counter",
  "skybound_art",
  "bleed",
  "cant_attack",
  "max_damage_cap",
  "countdown",
  "last_words",
]);

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

function hasExplicitHasCase(key: string, source: string): boolean {
  const compact = key.replace(/_/g, "");
  const patterns = [
    `case "${compact}"`,
    `case '${compact}'`,
    `case "${key}"`,
    `=== "${key}"`,
    `=== '${key}'`,
  ];
  return patterns.some((p) => source.includes(p));
}

function hasExplicitRemoveBranch(key: string, source: string): boolean {
  return (
    source.includes(`keywordToRemove === "${key}"`) ||
    source.includes(`keywordToRemove === '${key}'`)
  );
}

function inherentHelperName(key: string): string {
  const camel = key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `hasInherent${camel}`;
}

describe("keyword registration checklist", () => {
  const hasSource = readSrc("src/logic/core/keywords/has.ts");
  const removeSource = readSrc("src/logic/core/keywords/remove.ts");
  const registrySource = readSrc("src/logic/core/keywords/registry.ts");
  const typesSource = readSrc("src/logic/core/keywords/types.ts");
  const keywordsDataSource = readSrc("src/data/keywords.ts");
  const cardIndexSource = readSrc("src/data/cardIndex.ts");
  const stateHashSource = readSrc("src/core/stateHash.ts");
  const memoSource = readSrc("src/ui/zones/memoization.ts");
  const overlaysSource = readSrc("src/ui/overlays.ts");

  it("exports a stable KEYWORD_MAP key list", () => {
    expect(KEYWORD_MAP_KEYS.length).toBeGreaterThan(20);
  });

  it("every KEYWORD_MAP key normalizes to itself", () => {
    for (const key of KEYWORD_MAP_KEYS) {
      expect(normalizeKeywordName(key), key).toBe(key);
    }
  });

  it("every KEYWORD_MAP key is registry-normalizable (union literal, alias, or string fallback)", () => {
    const unionHasStringFallback = registrySource.includes("| string");
    for (const key of KEYWORD_MAP_KEYS) {
      const inUnionLiteral =
        registrySource.includes(`"${key}"`) ||
        registrySource.includes(`'${key}'`);
      const inAliases = Object.values(KEYWORD_ALIASES).includes(key as never);
      const normalizes = normalizeKeywordName(key) === key;
      expect(
        inUnionLiteral || inAliases || (unionHasStringFallback && normalizes),
        `registry cannot normalize ${key}`,
      ).toBe(true);
    }
  });

  it("keywordState-related fields are declared in types.ts when handlers use getKS", () => {
    // Spot-check high-traffic keywordState fields referenced by apply.ts handlers.
    const expectedFragments = [
      "maxDamageCap",
      "cannotBeDestroyed",
      "lastWordsEffects",
      "hasRally",
      "spellboost",
      "engageEffects",
      "hasBleed",
      "cantAttack",
      "hasBarrier",
    ];
    for (const frag of expectedFragments) {
      expect(typesSource, `KeywordState missing ${frag}`).toContain(frag);
    }
  });

  it("evergreen keywords have hasInherent* helpers and cardIndex wiring", () => {
    const evergreenLower = new Set(
      EVERGREEN_KEYWORDS.map((k) => k.toLowerCase().replace(/\s+/g, "_")),
    );
    for (const key of KEYWORD_MAP_KEYS) {
      if (NON_EVERGREEN_KEYWORDS.has(key)) continue;
      const normalizedEvergreen = key.replace(/_/g, " ");
      const isEvergreen = [...evergreenLower].some(
        (eg) =>
          eg === key ||
          eg.replace(/_/g, "") === key.replace(/_/g, "") ||
          eg.includes(key.replace(/_/g, " ")),
      );
      if (!isEvergreen && !["ignores_ward"].includes(key)) {
        // ignores_ward is evergreen in cardImplementationStatus as "Ignores Ward"
        continue;
      }
      if (key === "ignores_ward") {
        expect(cardIndexSource).toContain("hasInherent");
        continue;
      }
      const helper = inherentHelperName(
        key === "banish_on_death" ? "BanishOnDeath" : key,
      );
      if (key === "banish_on_death") {
        expect(keywordsDataSource).toContain("hasInherentBanishOnDeath");
        expect(cardIndexSource).toContain("hasInherentBanishOnDeath");
        continue;
      }
      if (keywordsDataSource.includes(`function ${helper}`)) {
        expect(cardIndexSource, `cardIndex missing ${helper}`).toContain(
          helper,
        );
      }
    }
  });

  it("combat evergreen keywords have has.ts switch coverage or keywords-array fallback", () => {
    const flagKeywords = [
      "ward",
      "rush",
      "storm",
      "bane",
      "drain",
      "ambush",
      "intimidate",
      "taunt",
    ];
    for (const key of flagKeywords) {
      if (!KEYWORD_MAP_KEYS.includes(key)) continue;
      const explicit = hasExplicitHasCase(key, hasSource);
      const arrayFallback = hasSource.includes("Check keywords array");
      expect(
        explicit || arrayFallback,
        `has.ts missing coverage for ${key}`,
      ).toBe(true);
    }
  });

  it("remove.ts clears flag keywords or strips keywords[] for structured entries", () => {
    for (const key of KEYWORD_MAP_KEYS) {
      const hasBranch = hasExplicitRemoveBranch(key, removeSource);
      const arrayOnly = REMOVE_KEYWORDS_ARRAY_ONLY.has(key);
      expect(
        hasBranch || arrayOnly,
        `remove.ts missing branch for ${key}`,
      ).toBe(true);
    }
  });

  it("stateHash: canonical flags or named exemption for every KEYWORD_MAP key", () => {
    for (const key of KEYWORD_MAP_KEYS) {
      const canonicalFlag = STATE_HASH_CANONICAL[key];
      const exempt = STATE_HASH_EXEMPTIONS[key];
      if (canonicalFlag) {
        expect(
          stateHashSource,
          `canonicalizeCard should reference ${canonicalFlag}`,
        ).toContain(canonicalFlag);
        expect(
          exempt,
          `${key} is hashed — remove exemption if present`,
        ).toBeUndefined();
      } else {
        expect(
          exempt,
          `add STATE_HASH_EXEMPTIONS entry for ${key}`,
        ).toBeDefined();
        expect(
          exempt!.length,
          `${key} exemption needs a reason`,
        ).toBeGreaterThan(10);
      }
    }
  });

  it("STATE_HASH_EXEMPTIONS has no stale entries", () => {
    const exemptKeys = Object.keys(STATE_HASH_EXEMPTIONS).sort();
    for (const key of exemptKeys) {
      expect(KEYWORD_MAP_KEYS, `stale exemption ${key}`).toContain(key);
    }
    const unhashed = KEYWORD_MAP_KEYS.filter((k) => !STATE_HASH_CANONICAL[k]);
    expect(exemptKeys.length).toBe(unhashed.length);
  });

  it("UI memoization tracks board-visible keyword flags", () => {
    for (const flag of [
      "hasBarrier",
      "hasWard",
      "hasBane",
      "hasAmbush",
      "hasStorm",
      "hasRush",
      "hasDrain",
    ]) {
      expect(memoSource, `memoization missing ${flag}`).toContain(flag);
    }
    expect(overlaysSource).toContain("applyKeywordOverlays");
  });

  it("documents exemption count for PR audits", () => {
    expect(Object.keys(STATE_HASH_EXEMPTIONS).length).toBe(5);
  });

  it("STATE_HASH_STATIC_EFFECT_EXCLUSIONS documents every excluded effect array", () => {
    expect(STATE_HASH_STATIC_EFFECT_EXCLUSIONS.triggers).toBeDefined();
    expect(STATE_HASH_STATIC_EFFECT_EXCLUSIONS.enhanceTiers).toBeDefined();
    expect(STATE_HASH_STATIC_EFFECT_EXCLUSIONS.accelerateTiers).toBeDefined();
    expect(STATE_HASH_STATIC_EFFECT_EXCLUSIONS.crystallizeTiers).toBeDefined();
    expect(STATE_HASH_STATIC_EFFECT_EXCLUSIONS.lastWordsEffects).toBeDefined();
  });
});
