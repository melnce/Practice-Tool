// src/data/cardIndex.ts
// ─────────────────────────────────────────────────────────────────────────────
// PURE CARD INDEX - No fetch, no DOM, no side effects
// This module builds card lookup indices from raw card data.
// ─────────────────────────────────────────────────────────────────────────────

import { CardTemplate } from "../core/types/index.js";
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
          (k as { name?: string }).name === "LastWords",
      );
      card.lastWordsEffects = lastWordsKeyword?.effects ?? [];
    }

    if (card.hasCountdown && keywords.length > 0) {
      const countdownKeyword = keywords.find(
        (k): k is { name: string; turns?: string | number } =>
          typeof k === "object" &&
          k !== null &&
          (k as { name?: string }).name === "Countdown",
      );
      if (countdownKeyword) {
        card.countdown = parseInt(String(countdownKeyword.turns)) || 0;
      }
    }
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
// Global Card Index (singleton for engine use)
// ─────────────────────────────────────────────────────────────────────────────

// Use globalThis to bridge split-brain modules in test environment
const GLOBAL_KEY = "__TEST_CARD_INDEX__";
let globalCardIndex: CardIndex | null = (globalThis as any)[GLOBAL_KEY] || null;

export function getGlobalCardIndex(): CardIndex | null {
  return globalCardIndex;
}

/**
 * Initialize the global card index.
 * Call this once at startup with cards loaded via browser or Node loader.
 */
export function initCardDatabase(cards: BuildCardIndexInput): void {
  globalCardIndex = buildCardIndex(cards);
  (globalThis as any)[GLOBAL_KEY] = globalCardIndex;
  console.log(
    `DEBUG: cardIndex.ts - initCardDatabase called. globalCardIndex set. Global key '${GLOBAL_KEY}' set:`,
    !!(globalThis as any)[GLOBAL_KEY],
  );
}

/**
 * Get card details by name or ID.
 * Returns null if card not found or database not initialized.
 */
export function getCardDetails(nameOrId: string): CardTemplate | null {
  if (!globalCardIndex) {
    console.log(
      `DEBUG: cardIndex.ts - globalCardIndex is null. Attempting recovery from global key '${GLOBAL_KEY}'...`,
    );
    globalCardIndex = (globalThis as any)[GLOBAL_KEY] || null;
    console.log(`DEBUG: cardIndex.ts - Recovery result:`, !!globalCardIndex);
  }
  // Debug for specific key failure
  if (nameOrId === "Goblin" && !globalCardIndex) {
    console.log(
      "DEBUG: cardIndex.ts - getCardDetails('Goblin') failed because globalCardIndex is still null.",
    );
  }
  if (!nameOrId || !globalCardIndex) return null;

  // 1. Exact ID match (8+ digits)
  if (/^\d{8,}$/.test(nameOrId)) {
    const byId = globalCardIndex.byId.get(nameOrId);
    if (byId) return byId;
  }

  // 2. Name match (main cards first, then tokens)
  return (
    globalCardIndex.byName.get(nameOrId) ??
    globalCardIndex.tokensByName.get(nameOrId) ??
    null
  );
}

/**
 * Get card by ID only.
 */
export function getCardById(id: string): CardTemplate | null {
  if (!globalCardIndex) return null;
  return globalCardIndex.byId.get(String(id)) ?? null;
}

/**
 * Check if card database is initialized.
 */
export function isCardDatabaseInitialized(): boolean {
  return globalCardIndex !== null;
}

/**
 * Reset global index (for testing).
 */
export function resetCardIndex(): void {
  globalCardIndex = null;
}

/**
 * Inject a single card for testing.
 */
export function injectCardForTest(card: CardTemplate): void {
  if (!card.name) return;

  if (!globalCardIndex) {
    globalCardIndex = {
      byName: new Map(),
      byId: new Map(),
      tokensByName: new Map(),
    };
  }

  // Cast to mutable for injection
  (globalCardIndex.byName as Map<string, CardTemplate>).set(card.name, card);
  if (card.id) {
    (globalCardIndex.byId as Map<string, CardTemplate>).set(
      String(card.id),
      card,
    );
  }
}













