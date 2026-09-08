// src/data/cardIndex.ts
// ─────────────────────────────────────────────────────────────────────────────
// PURE CARD INDEX - No fetch, no DOM, no side effects
// This module builds card lookup indices from raw card data.
// ─────────────────────────────────────────────────────────────────────────────

import type { CardTemplate } from "../core/types/index.js";
import { toNumber } from "../core/cardStats.js";
import {
  hasInherentStorm,
  hasInherentRush,
  hasInherentWard,
  hasInherentIntimidate,
  hasInherentBarrier,
  hasInherentBane,
  hasInherentBanishOnDeath,
  hasInherentLastWords,
  hasInherentCountdown,
} from "./keywords.js";
import { getImplementationStatus } from "./cardImplementationStatus.js";
import { normalizeKeywordName } from "../logic/core/keywords/registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CardIndex {
  /** Cards by name */
  byName: ReadonlyMap<string, CardTemplate>;
  /** Cards by ID */
  byId: ReadonlyMap<string, CardTemplate>;
  /** Token cards by name */
  tokensByName: ReadonlyMap<string, CardTemplate>;
}

export interface RawCardData {
  name?: string;
  id?: string;
  type?: string;
  description?: string;
  keywords?: unknown[];
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Processing (pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a raw card object and apply keyword flags.
 * Returns a CardTemplate with computed flags.
 */
export function processCard(raw: RawCardData): CardTemplate | null {
  if (!raw.name) return null;

  // Start with raw data and type as CardTemplate
  const card: Record<string, unknown> = { ...raw };

  if (card.type === "Follower" || card.type === "Amulet") {
    // Provide defaults for keyword helper functions
    const description =
      typeof card.description === "string" ? card.description : "";
    const keywords = Array.isArray(card.keywords) ? card.keywords : [];

    card.hasStorm = hasInherentStorm(description, keywords);
    card.hasRush = hasInherentRush(description, keywords);
    card.hasWard = hasInherentWard(description, keywords);
    card.hasIntimidate = hasInherentIntimidate(description, keywords);
    card.hasBarrier = hasInherentBarrier(description, keywords);
    card.hasBane = hasInherentBane(description, keywords);
    card.hasBanishOnDeath = hasInherentBanishOnDeath(keywords);
    card.hasLastWords = hasInherentLastWords(keywords);
    card.hasCountdown = hasInherentCountdown(keywords);

    if (card.hasLastWords && keywords.length > 0) {
      const lastWordsKeyword = keywords.find(
        (k): k is { name: string; effects?: unknown[] } =>
          typeof k === "object" &&
          k !== null &&
          normalizeKeywordName((k as { name?: string }).name ?? "") ===
            "last_words",
      );
      card.lastWordsEffects = lastWordsKeyword?.effects ?? [];
    }

    if (card.hasCountdown && keywords.length > 0) {
      const countdownKeyword = keywords.find(
        (
          k,
        ): k is {
          name: string;
          turns?: string | number;
          count?: string | number;
        } =>
          typeof k === "object" &&
          k !== null &&
          normalizeKeywordName((k as { name?: string }).name ?? "") ===
            "countdown",
      );
      if (countdownKeyword) {
        const turns = countdownKeyword.turns ?? countdownKeyword.count;
        card.countdown = parseInt(String(turns)) || 0;
      }
    }
  }

  // Derived — never trust a hand-maintained flag on disk.
  card.implementationStatus = getImplementationStatus(card as RawCardData);

  // JSON stores cost/attack/defense as strings; coerce once at index build.
  if (card.cost !== undefined) card.cost = toNumber(card.cost);
  if (card.attack !== undefined) card.attack = toNumber(card.attack);
  if (card.defense !== undefined) card.defense = toNumber(card.defense);
  if (card.base_cost === undefined && card.cost !== undefined) {
    card.base_cost = card.cost;
  }

  return card as CardTemplate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Index Building (pure)
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildCardIndexInput {
  /** Main card data (all.json + vanilla_lab_set.json) */
  mainCards: readonly RawCardData[];
  /** Token card data (token_details.json) */
  tokenCards: readonly RawCardData[];
}

/**
 * Build card lookup indices from raw card data.
 * This is a pure function with no side effects.
 */
export function buildCardIndex(input: BuildCardIndexInput): CardIndex {
  const byName = new Map<string, CardTemplate>();
  const byId = new Map<string, CardTemplate>();
  const tokensByName = new Map<string, CardTemplate>();

  // Process main cards
  for (const raw of input.mainCards) {
    const card = processCard(raw);
    if (card && card.name) {
      byName.set(card.name, card);
      if (card.id) {
        byId.set(String(card.id), card);
      }
    }
  }

  // Process token cards
  for (const raw of input.tokenCards) {
    const card = processCard(raw);
    if (card && card.name) {
      tokensByName.set(card.name, card);
      if (card.id) {
        byId.set(String(card.id), card);
      }
    }
  }

  return { byName, byId, tokensByName };
}

// ─────────────────────────────────────────────────────────────────────────────

// Use globalThis to bridge split-brain modules in test environment
// CRITICAL: Do NOT use a module-level variable - ESM split-brain creates
// separate module instances, each with their own variable. Always read/write
// directly to globalThis to ensure all instances share the same data.
const GLOBAL_KEY = "__CARD_INDEX__";

/**
 * Get the shared card index from globalThis.
 * Always reads from globalThis to handle ESM split-brain.
 */
function getIndex(): CardIndex | null {
  return (globalThis as any)[GLOBAL_KEY] || null;
}

export function getGlobalCardIndex(): CardIndex | null {
  return getIndex();
}

/**
 * Initialize the global card index.
 * Call this once at startup with cards loaded via browser or Node loader.
 */
export function initCardDatabase(cards: BuildCardIndexInput): void {
  const index = buildCardIndex(cards);
  (globalThis as any)[GLOBAL_KEY] = index;
  console.log(
    `DEBUG: cardIndex.ts - initCardDatabase called. Global key '${GLOBAL_KEY}' set:`,
    !!(globalThis as any)[GLOBAL_KEY],
  );
}

/**
 * Get card details by name or ID.
 * Returns null if card not found or database not initialized.
 */
export function getCardDetails(nameOrId: string): CardTemplate | null {
  const index = getIndex();
  if (!nameOrId || !index) return null;

  // 1. Exact ID match (8+ digits)
  if (/^\d{8,}$/.test(nameOrId)) {
    const byId = index.byId.get(nameOrId);
    if (byId) return byId;
  }

  // 2. Name match (main cards first, then tokens)
  return index.byName.get(nameOrId) ?? index.tokensByName.get(nameOrId) ?? null;
}

/**
 * Get card by ID only.
 */
export function getCardById(id: string): CardTemplate | null {
  const index = getIndex();
  if (!index) return null;
  return index.byId.get(String(id)) ?? null;
}

/**
 * Check if card database is initialized.
 */
export function isCardDatabaseInitialized(): boolean {
  return getIndex() !== null;
}

/**
 * Reset global index (for testing).
 */
export function resetCardIndex(): void {
  (globalThis as any)[GLOBAL_KEY] = null;
}

/**
 * Inject a single card for testing.
 */
export function injectCardForTest(card: CardTemplate): void {
  if (!card.name) return;

  let index = getIndex();
  if (!index) {
    index = {
      byName: new Map(),
      byId: new Map(),
      tokensByName: new Map(),
    };
    (globalThis as any)[GLOBAL_KEY] = index;
  }

  // Cast to mutable for injection
  (index.byName as Map<string, CardTemplate>).set(card.name, card);
  if (card.id) {
    (index.byId as Map<string, CardTemplate>).set(String(card.id), card);
  }
}
