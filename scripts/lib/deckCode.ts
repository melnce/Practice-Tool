/**
 * Shadowverse: Worlds Beyond deck hash codec (offline decode/encode).
 * Pure functions — callers load cards/all.json and pass the catalog in.
 */

export const DECK_CODE_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

export const DECK_FORMAT_ID = 1;

export const DECK_CLASS_IDS: Readonly<Record<number, string>> = {
  1: "Forestcraft",
  2: "Swordcraft",
  3: "Runecraft",
  4: "Dragoncraft",
  5: "Abysscraft",
  6: "Havencraft",
  7: "Portalcraft",
};

export const CLASS_NAME_TO_ID: Readonly<Record<string, number>> =
  Object.fromEntries(
    Object.entries(DECK_CLASS_IDS).map(([id, name]) => [name, Number(id)]),
  );

const DECK_HASH_PATTERN =
  /(?<![0-9A-Za-z_.-])([0-9]+\.[1-7](?:\.[0-9A-Za-z_-]{4}){40})(?!(?:[0-9A-Za-z_-]|\.[0-9A-Za-z_-]))/g;

const DECK_SIZE = 40;
const COPY_LIMIT = 3;
const TOKEN_SET_PREFIX = "9";

export interface DeckCodeCard {
  id: string;
  name: string;
  class: string;
}

export interface DeckCodeCatalog {
  byId: ReadonlyMap<string, DeckCodeCard>;
  byName: ReadonlyMap<string, DeckCodeCard>;
}

export interface ParsedDeckHash {
  formatId: number;
  classId: number;
  className: string;
  cardIds: string[];
}

export interface DeckFileCardEntry {
  name: string;
  count: number;
}

export interface DeckFileObject {
  class: string;
  deckName: string;
  size: number;
  cards: DeckFileCardEntry[];
}

export interface DeckDiffEntry {
  name: string;
  hashCount: number;
  fileCount: number;
}

export interface DeckDiffResult {
  identical: boolean;
  classMismatch?: { hashClass: string; fileClass: string };
  added: DeckDiffEntry[];
  removed: DeckDiffEntry[];
  countChanged: DeckDiffEntry[];
}

export class DeckCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckCodeError";
  }
}

export function buildDeckCodeCatalog(
  cards: readonly DeckCodeCard[],
): DeckCodeCatalog {
  const byId = new Map<string, DeckCodeCard>();
  const byName = new Map<string, DeckCodeCard>();
  for (const card of cards) {
    byId.set(card.id, card);
    if (!byName.has(card.name)) {
      byName.set(card.name, card);
    }
  }
  return { byId, byName };
}

export function decodeCardToken(token: string): number {
  if (token.length !== 4) {
    throw new DeckCodeError(
      `Invalid card token "${token}": expected exactly 4 symbols`,
    );
  }

  let value = 0;
  for (const symbol of token) {
    const index = DECK_CODE_ALPHABET.indexOf(symbol);
    if (index < 0) {
      throw new DeckCodeError(
        `Invalid card token "${token}": unknown symbol "${symbol}"`,
      );
    }
    value = value * 64 + index;
  }

  return value;
}

export function encodeCardId(id: number | string): string {
  const idStr = String(id);
  if (idStr.startsWith(TOKEN_SET_PREFIX)) {
    throw new DeckCodeError(
      `Card id "${idStr}" is a token (set ${TOKEN_SET_PREFIX}0000) and cannot appear in a deck hash`,
    );
  }

  let remaining = typeof id === "string" ? Number(id) : id;
  if (!Number.isFinite(remaining) || remaining < 0) {
    throw new DeckCodeError(`Invalid card id "${String(id)}"`);
  }

  let token = "";
  for (let i = 0; i < 4; i++) {
    token = DECK_CODE_ALPHABET[remaining % 64] + token;
    remaining = Math.floor(remaining / 64);
  }

  return token;
}

function percentDecodeTwice(text: string): string {
  let decoded = text;
  for (let pass = 0; pass < 2; pass++) {
    try {
      const next = decodeURIComponent(decoded.replace(/\+/g, "%20"));
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

export function extractDeckHash(text: string): string {
  const decoded = percentDecodeTwice(text.trim());
  const matches = [...decoded.matchAll(DECK_HASH_PATTERN)].map((m) => m[1]);

  if (matches.length === 0) {
    throw new DeckCodeError("No deck hash found in input");
  }
  if (matches.length > 1) {
    throw new DeckCodeError(
      `Ambiguous input: found ${matches.length} deck hashes`,
    );
  }

  return matches[0];
}

function parseClassId(classPart: string): number {
  const classId = Number(classPart);
  if (!Number.isInteger(classId) || classId < 1 || classId > 7) {
    throw new DeckCodeError(
      `Invalid deck class id "${classPart}" (expected 1–7)`,
    );
  }
  return classId;
}

function assertNotTokenId(id: string): void {
  if (id.startsWith(TOKEN_SET_PREFIX)) {
    throw new DeckCodeError(
      `Card id "${id}" is a token (set ${TOKEN_SET_PREFIX}0000) and cannot appear in a deck hash`,
    );
  }
}

function validateDecodedDeck(
  cardIds: string[],
  classId: number,
  className: string,
  catalog: DeckCodeCatalog,
): void {
  if (cardIds.length !== DECK_SIZE) {
    throw new DeckCodeError(
      `Deck hash has ${cardIds.length} cards (expected ${DECK_SIZE})`,
    );
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of counts) {
    if (count > COPY_LIMIT) {
      const card = catalog.byId.get(id);
      const label = card ? `${card.name} (${id})` : id;
      throw new DeckCodeError(
        `Card ${label} appears ${count} times (maximum ${COPY_LIMIT})`,
      );
    }
  }

  for (const id of cardIds) {
    assertNotTokenId(id);
    const card = catalog.byId.get(id);
    if (!card) {
      throw new DeckCodeError(
        `Unknown card id "${id}" (not in cards/all.json)`,
      );
    }
    if (card.class !== className && card.class !== "Neutral") {
      throw new DeckCodeError(
        `Card "${card.name}" (${id}) is ${card.class}, not ${className} or Neutral`,
      );
    }
  }
}

export function parseDeckHash(
  hash: string,
  catalog: DeckCodeCatalog,
): ParsedDeckHash {
  const parts = hash.split(".");
  if (parts.length !== DECK_SIZE + 2) {
    throw new DeckCodeError(
      `Deck hash has ${parts.length - 2} card tokens (expected ${DECK_SIZE})`,
    );
  }

  const formatId = Number(parts[0]);
  if (!Number.isInteger(formatId) || formatId < 1) {
    throw new DeckCodeError(`Invalid format id "${parts[0]}"`);
  }

  const classId = parseClassId(parts[1]);
  const className = DECK_CLASS_IDS[classId];
  const tokens = parts.slice(2);

  const cardIds: string[] = [];
  for (const token of tokens) {
    if (!/^[0-9A-Za-z_-]{4}$/.test(token)) {
      throw new DeckCodeError(`Invalid card token "${token}"`);
    }
    const id = String(decodeCardToken(token));
    cardIds.push(id);
  }

  validateDecodedDeck(cardIds, classId, className, catalog);

  return { formatId, classId, className, cardIds };
}

export function encodeDeckHash(input: {
  classId: number;
  cardIds: readonly string[];
  formatId?: number;
}): string {
  const { classId, cardIds, formatId = DECK_FORMAT_ID } = input;

  if (!DECK_CLASS_IDS[classId]) {
    throw new DeckCodeError(`Invalid deck class id ${classId} (expected 1–7)`);
  }
  if (cardIds.length !== DECK_SIZE) {
    throw new DeckCodeError(
      `Cannot encode deck with ${cardIds.length} cards (expected ${DECK_SIZE})`,
    );
  }

  const tokens = cardIds.map((id) => encodeCardId(id));
  return [String(formatId), String(classId), ...tokens].join(".");
}

export function deckFileFromHash(
  hash: string,
  catalog: DeckCodeCatalog,
  deckName: string,
): DeckFileObject {
  const parsed = parseDeckHash(hash, catalog);
  const cards: DeckFileCardEntry[] = [];
  const seen = new Set<string>();

  for (const id of parsed.cardIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const card = catalog.byId.get(id);
    if (!card) {
      throw new DeckCodeError(
        `Unknown card id "${id}" (not in cards/all.json)`,
      );
    }
    const count = parsed.cardIds.filter((x) => x === id).length;
    cards.push({ name: card.name, count });
  }

  return {
    class: parsed.className,
    deckName,
    size: DECK_SIZE,
    cards,
  };
}

function countCardsByNameFromIds(
  cardIds: readonly string[],
  catalog: DeckCodeCatalog,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    const card = catalog.byId.get(id);
    if (!card) {
      throw new DeckCodeError(
        `Unknown card id "${id}" (not in cards/all.json)`,
      );
    }
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
  }
  return counts;
}

function countCardsByNameFromFile(
  deckFile: DeckFileObject,
  catalog: DeckCodeCatalog,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of deckFile.cards ?? []) {
    if (!entry.name) {
      throw new DeckCodeError("Deck file entry missing card name");
    }
    const card = catalog.byName.get(entry.name);
    if (!card) {
      throw new DeckCodeError(
        `Unknown card "${entry.name}" (not in cards/all.json)`,
      );
    }
    const count = entry.count ?? 1;
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + count);
  }
  return counts;
}

export function diffDeckFile(
  hash: string,
  deckFile: DeckFileObject,
  catalog: DeckCodeCatalog,
): DeckDiffResult {
  const parsed = parseDeckHash(hash, catalog);
  const hashCounts = countCardsByNameFromIds(parsed.cardIds, catalog);
  const fileCounts = countCardsByNameFromFile(deckFile, catalog);

  const classMismatch =
    deckFile.class && deckFile.class !== parsed.className
      ? { hashClass: parsed.className, fileClass: deckFile.class }
      : undefined;

  const added: DeckDiffEntry[] = [];
  const removed: DeckDiffEntry[] = [];
  const countChanged: DeckDiffEntry[] = [];

  const allNames = new Set([...hashCounts.keys(), ...fileCounts.keys()]);
  for (const name of [...allNames].sort()) {
    const hashCount = hashCounts.get(name) ?? 0;
    const fileCount = fileCounts.get(name) ?? 0;
    if (hashCount === 0 && fileCount > 0) {
      removed.push({ name, hashCount, fileCount });
    } else if (fileCount === 0 && hashCount > 0) {
      added.push({ name, hashCount, fileCount });
    } else if (hashCount !== fileCount) {
      countChanged.push({ name, hashCount, fileCount });
    }
  }

  const identical =
    !classMismatch &&
    added.length === 0 &&
    removed.length === 0 &&
    countChanged.length === 0;

  return {
    identical,
    classMismatch,
    added,
    removed,
    countChanged,
  };
}

export function expandDeckFileToCardIds(
  deckFile: DeckFileObject,
  catalog: DeckCodeCatalog,
): string[] {
  const ids: string[] = [];
  for (const entry of deckFile.cards ?? []) {
    if (!entry.name) {
      throw new DeckCodeError("Deck file entry missing card name");
    }
    const card = catalog.byName.get(entry.name);
    if (!card) {
      throw new DeckCodeError(
        `Unknown card "${entry.name}" (not in cards/all.json)`,
      );
    }
    const count = entry.count ?? 1;
    for (let i = 0; i < count; i++) {
      ids.push(card.id);
    }
  }
  return ids;
}

export function encodeDeckFile(
  deckFile: DeckFileObject,
  catalog: DeckCodeCatalog,
): string {
  const classId = CLASS_NAME_TO_ID[deckFile.class];
  if (!classId) {
    throw new DeckCodeError(`Unknown deck class "${deckFile.class}"`);
  }

  const cardIds = expandDeckFileToCardIds(deckFile, catalog);
  if (cardIds.length !== DECK_SIZE) {
    throw new DeckCodeError(
      `Deck file has ${cardIds.length} cards (expected ${DECK_SIZE})`,
    );
  }

  return encodeDeckHash({ classId, cardIds });
}

export const DECK_SHARE_BASE_URL =
  "https://shadowverse-wb.com/en/deck/detail/?hash=";

export function deckShareUrl(hash: string): string {
  return `${DECK_SHARE_BASE_URL}${hash}`;
}
