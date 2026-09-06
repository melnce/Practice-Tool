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
  cost?: string | number;
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

/** Official 4-character deck-code API response (POST …/DeckCode/getDeck). */
export interface GetDeckApiResponse {
  responseCode?: number;
  data_headers?: { result_code?: number; csrf_token?: string };
  data?: GetDeckData;
}

/** Fields read from getDeck `data` — see import-deck-code.ts. */
export interface GetDeckData {
  class_id: number;
  sort_card_id_list: readonly (number | string)[];
  deck_card_num?: Readonly<Record<string, number>>;
  mana_curve?: readonly number[];
  num_follower?: number;
  num_spell?: number;
  num_amulet?: number;
}

const GET_DECK_NOT_FOUND = 5400;

export function parseGetDeckResponse(body: unknown): GetDeckData {
  if (body == null || typeof body !== "object") {
    throw new DeckCodeError("Invalid getDeck response");
  }

  const resp = body as GetDeckApiResponse;
  const resultCode = resp.data_headers?.result_code;

  if (!resp.data || resultCode !== 1) {
    if (resultCode === GET_DECK_NOT_FOUND) {
      throw new DeckCodeError(
        "Deck code not found or expired (official API returned 5400)",
      );
    }
    throw new DeckCodeError(
      `getDeck failed (result_code ${resultCode ?? "missing"})`,
    );
  }

  const data = resp.data;
  const list = data.sort_card_id_list;
  if (!Array.isArray(list) || list.length !== DECK_SIZE) {
    throw new DeckCodeError(
      `getDeck returned ${list?.length ?? 0} cards (expected ${DECK_SIZE})`,
    );
  }

  if (!DECK_CLASS_IDS[data.class_id]) {
    throw new DeckCodeError(`Unknown class_id ${data.class_id} from getDeck`);
  }

  return data;
}

export function deckFileFromGetDeck(
  data: GetDeckData,
  catalog: DeckCodeCatalog,
  deckName: string,
): DeckFileObject {
  const className = DECK_CLASS_IDS[data.class_id];
  const cardIds = data.sort_card_id_list.map(String);
  validateDecodedDeck(cardIds, data.class_id, className, catalog);

  const cards: DeckFileCardEntry[] = [];
  const seen = new Set<string>();

  for (const id of cardIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const card = catalog.byId.get(id);
    if (!card) {
      throw new DeckCodeError(
        `Unknown card id "${id}" (not in cards/all.json)`,
      );
    }
    const count = cardIds.filter((x) => x === id).length;
    cards.push({ name: card.name, count });
  }

  return {
    class: className,
    deckName,
    size: DECK_SIZE,
    cards,
  };
}

export function buildCostById(
  cards: readonly DeckCodeCard[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const card of cards) {
    const cost = Number(card.cost ?? 0);
    map.set(card.id, Number.isFinite(cost) ? cost : 0);
  }
  return map;
}

/** Mana curve indexed by playable cost (0–10); length 11. */
export function computeManaCurveFromIds(
  cardIds: readonly string[],
  costById: ReadonlyMap<string, number>,
): number[] {
  const curve = new Array(11).fill(0);
  for (const id of cardIds) {
    const raw = costById.get(id) ?? 0;
    const cost = Math.min(10, Math.max(0, raw));
    curve[cost]++;
  }
  return curve;
}

export function formatManaCurveMismatch(
  expected: readonly number[],
  actual: readonly number[],
): string | null {
  if (expected.length !== actual.length) {
    return `mana_curve length ${actual.length} (expected ${expected.length})`;
  }
  const parts: string[] = [];
  for (let cost = 0; cost < expected.length; cost++) {
    if (expected[cost] !== actual[cost]) {
      parts.push(
        `cost ${cost}: computed ${expected[cost]}, API ${actual[cost]}`,
      );
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}
