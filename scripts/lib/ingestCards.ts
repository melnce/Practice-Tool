/**
 * DotGG → repo card mapping + merge-by-id (never clobber authored ops).
 *
 * LOUDEST INVARIANT: existing cards keep hand-authored effect fields
 * (fanfare / spell / evolve / superevolve / triggers / keywords / …).
 * Ingest only adds brand-new cards or fills fields that are completely absent.
 */

import fs from "fs";
import path from "path";
import { EVERGREEN_KEYWORDS } from "../../src/data/cardImplementationStatus.js";

export const DOTGG_CARDS_URL =
  "https://api.dotgg.gg/cgfw/getcards?game=shadowverse";
export const DOTGG_SETS_URL =
  "https://api.dotgg.gg/cgfw/getsets?game=shadowverse";
export const CYGAMES_CARDSET_URL =
  "https://shadowverse-wb.com/web/CardSet/index?lang=en";

export const CLASS_BY_ID: Record<string, string> = {
  "0": "Neutral",
  "1": "Forestcraft",
  "2": "Swordcraft",
  "3": "Runecraft",
  "4": "Dragoncraft",
  "5": "Abysscraft",
  "6": "Havencraft",
  "7": "Portalcraft",
};

export const RARITY_BY_ID: Record<string, string> = {
  "1": "Bronze",
  "2": "Silver",
  "3": "Gold",
  "4": "Legendary",
};

/**
 * DotGG getsets / card.set_name can lag a new release. Keys are set ids.
 * Official name: Steam / Cygames set #9 (Aug 2026).
 */
export const SET_NAME_FALLBACKS: Record<string, string> = {
  "10009": "Revenants of Azvaldt",
  "90000": "Basic A",
};

/** Token set id on DotGG (all summoned / hand-token definitions). */
export const TOKEN_SET_ID = "90000";

/** DotGG `type: Spell` corrections (Engage / Countdown / Last Words amulets). */
export const CARD_TYPE_OVERRIDES: Record<string, string> = {
  "10903210": "Amulet", // Azvaldt, Penitentiary of Chaos
  "10963210": "Amulet", // Juratio
  "10911210": "Amulet", // Trap in the Woods (hand-trap amulet, not Spell)
};

/** Fields that encode authored executable content — NEVER overwrite if present. */
export const AUTHORED_EFFECT_KEYS = [
  "fanfare",
  "spell",
  "evolve",
  "superevolve",
  "triggers",
  "keywords",
  "invoke",
  "on_discard",
  "fuse",
  "fuse_recipes",
  "enhance_replaces_base",
  "evolve_trigger_always",
  "superEvolveReplaces",
  "attacks_per_turn",
  "cant_play",
  "engageSacrifice",
  "hasOngoing",
  "has_ongoing",
] as const;

/** Catalog / identity fields that may be filled when missing on an existing card. */
export const CATALOG_KEYS = [
  "name",
  "cost",
  "attack",
  "defense",
  "type",
  "class",
  "rarity",
  "tribes",
  "description",
  "base_image",
  "evo_image",
  "set",
  "url",
  "specific_effects",
] as const;

export type DotggCard = {
  id: string;
  slug?: string;
  name: string;
  skill_text?: string | null;
  class?: string | number;
  color?: string;
  type?: string;
  cost?: string | number;
  atk?: string | number;
  life?: string | number;
  rarity?: string | number;
  tribes?: string[];
  setId?: string;
  set_name?: string;
  is_token?: string | number | boolean;
  image?: string | null;
  image_back?: string | null;
  specific_effects?: unknown[];
};

export type DotggSet = {
  id: string;
  name: string;
  cardsCount?: string | number;
  name_original?: string;
  type?: string;
};

export type RepoCard = {
  id: string;
  name: string;
  cost: string;
  attack: string;
  defense: string;
  type: string;
  class: string;
  rarity: string;
  tribes: string[];
  description: string;
  base_image: string;
  evo_image: string;
  set: string;
  url: string;
  fanfare?: unknown[];
  spell?: unknown[];
  evolve?: unknown[];
  superevolve?: unknown[];
  keywords?: unknown[];
  triggers?: unknown[];
  specific_effects?: unknown[];
  [key: string]: unknown;
};

export type MergeChange =
  | { kind: "new"; id: string; name: string; setId: string }
  | {
      kind: "filled";
      id: string;
      name: string;
      fields: string[];
    }
  | {
      kind: "text_diff";
      id: string;
      name: string;
      existing: string;
      incoming: string;
    }
  | { kind: "unchanged"; id: string; name: string };

export function isTokenCard(card: DotggCard): boolean {
  const v = card.is_token;
  return v === "1" || v === 1 || v === true;
}

export function mapCardType(type: string | undefined): string {
  if (!type) return "Follower";
  if (type === "4" || type === "Spell") return "Spell";
  if (type === "Amulet") return "Amulet";
  if (type === "Follower") return "Follower";
  // Unknown numeric / string — pass through if already a known label
  return type;
}

export function mapClass(card: DotggCard): string {
  if (card.color && typeof card.color === "string" && card.color.trim()) {
    return card.color.trim();
  }
  const key = String(card.class ?? "");
  return CLASS_BY_ID[key] ?? "Neutral";
}

export function mapRarity(rarity: string | number | undefined): string {
  const key = String(rarity ?? "");
  return RARITY_BY_ID[key] ?? "Bronze";
}

/** Strip DotGG HTML skill_text into repo-style plain description. */
export function stripSkillText(html: string | null | undefined): string {
  if (!html) return "";
  return String(html)
    .replace(/<hr\s*\/?>/gi, "\n")
    .replace(/<\/?(?:b|i)(?:\s[^>]*)?>/gi, "")
    .replace(/<\/?color(?:\s[^>]*)?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function setDisplayName(setId: string, setName: string): string {
  // DotGG: "Skybound Dragons" or "Set 5: Blossoming Fate"
  const cleaned = setName.replace(/^Set\s*\d+\s*:\s*/i, "").trim();
  return `[${setId}] ${cleaned}`;
}

export function setSlug(setName: string): string {
  const cleaned = setName.replace(/^Set\s*\d+\s*:\s*/i, "").trim();
  return cleaned
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function setFileName(setId: string, setName: string): string {
  return `${setId}_${setSlug(setName)}.json`;
}

/** Pull evergreen keyword strings from description for new stubs. */
export function extractEvergreenKeywords(description: string): string[] {
  const found: string[] = [];
  const lines = description.split("\n").map((l) => l.trim());
  for (const kw of EVERGREEN_KEYWORDS) {
    const hit = lines.some(
      (line) => line.toLowerCase().replace(/\.$/, "") === kw.toLowerCase(),
    );
    if (hit) found.push(kw);
  }
  return found;
}

export function mapDotggCardToRepo(card: DotggCard): RepoCard {
  const type = CARD_TYPE_OVERRIDES[String(card.id)] ?? mapCardType(card.type);
  const description = stripSkillText(card.skill_text);
  const setId = String(card.setId ?? "");
  const setName =
    String(card.set_name ?? "").trim() || SET_NAME_FALLBACKS[setId] || setId;
  const baseImage =
    card.image || `https://static.dotgg.gg/shadowverse/cards/${card.id}.webp`;
  const evoImage =
    type === "Follower"
      ? `https://static.dotgg.gg/shadowverse/cards/${card.id}_evo.webp`
      : "";

  const evergreen = extractEvergreenKeywords(description);

  const mapped: RepoCard = {
    id: String(card.id),
    name: card.name,
    cost: String(card.cost ?? "0"),
    attack: String(card.atk ?? "0"),
    defense: String(card.life ?? "0"),
    type,
    class: mapClass(card),
    rarity: mapRarity(card.rarity),
    tribes: Array.isArray(card.tribes) ? [...card.tribes] : [],
    description,
    base_image: baseImage,
    evo_image: evoImage,
    set: setDisplayName(setId, setName),
    url: card.slug
      ? `https://shadowverse.gg/cards/${card.slug}`
      : `https://shadowverse.gg/cards/${card.id}`,
    evolve: [],
    superevolve: [],
    keywords: evergreen,
    triggers: [],
  };

  if (type === "Spell") {
    mapped.spell = [];
  } else {
    mapped.fanfare = [];
  }

  if (Array.isArray(card.specific_effects) && card.specific_effects.length) {
    mapped.specific_effects = card.specific_effects;
  }

  return mapped;
}

function fieldAbsent(card: RepoCard, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(card, key) || card[key] == null;
}

/**
 * Merge incoming mapped card into existing by id.
 * NEVER replaces authored effect fields when they already exist on `existing`
 * (including empty arrays — those are intentional authoring).
 */
export function mergeCardById(
  existing: RepoCard | undefined,
  incoming: RepoCard,
): { card: RepoCard; changes: MergeChange[] } {
  if (!existing) {
    return {
      card: incoming,
      changes: [
        {
          kind: "new",
          id: incoming.id,
          name: incoming.name,
          setId: String(incoming.set).match(/\[(\d+)\]/)?.[1] ?? "",
        },
      ],
    };
  }

  const changes: MergeChange[] = [];
  const merged: RepoCard = { ...existing };

  // Authored effect keys: never overwrite if the key exists at all.
  for (const key of AUTHORED_EFFECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(existing, key)) {
      // keep existing[key]
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      merged[key] = incoming[key];
      changes.push({
        kind: "filled",
        id: existing.id,
        name: existing.name,
        fields: [key],
      });
    }
  }

  const filledFields: string[] = [];
  for (const key of CATALOG_KEYS) {
    if (key === "specific_effects") {
      if (
        fieldAbsent(existing, key) &&
        Array.isArray(incoming.specific_effects)
      ) {
        merged.specific_effects = incoming.specific_effects;
        filledFields.push(key);
      }
      continue;
    }
    if (fieldAbsent(existing, key) && incoming[key] != null) {
      merged[key] = incoming[key];
      filledFields.push(key);
    }
  }
  if (filledFields.length) {
    changes.push({
      kind: "filled",
      id: existing.id,
      name: existing.name,
      fields: filledFields,
    });
  }

  const existingDesc = String(existing.description ?? "");
  const incomingDesc = String(incoming.description ?? "");
  if (existingDesc !== incomingDesc) {
    changes.push({
      kind: "text_diff",
      id: existing.id,
      name: existing.name,
      existing: existingDesc,
      incoming: incomingDesc,
    });
  }

  if (!changes.length) {
    changes.push({
      kind: "unchanged",
      id: existing.id,
      name: existing.name,
    });
  }

  return { card: merged, changes };
}

export type SetMergeResult = {
  setId: string;
  fileName: string;
  cards: RepoCard[];
  changes: MergeChange[];
  wrote: boolean;
};

/**
 * Merge a list of mapped cards into an existing set file's cards (by id).
 * Preserves order of existing cards; appends new ones sorted by id.
 */
export function mergeSetCards(
  existingCards: RepoCard[],
  incomingCards: RepoCard[],
): { cards: RepoCard[]; changes: MergeChange[] } {
  const byId = new Map<string, RepoCard>();
  for (const c of existingCards) byId.set(String(c.id), c);

  const changes: MergeChange[] = [];
  const seen = new Set<string>();

  // Update / keep existing in original order
  const out: RepoCard[] = [];
  for (const existing of existingCards) {
    const id = String(existing.id);
    seen.add(id);
    const incoming = incomingCards.find((c) => String(c.id) === id);
    if (!incoming) {
      out.push(existing);
      continue;
    }
    const { card, changes: ch } = mergeCardById(existing, incoming);
    out.push(card);
    changes.push(...ch);
  }

  // Append new cards
  const newcomers = incomingCards
    .filter((c) => !seen.has(String(c.id)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const incoming of newcomers) {
    const { card, changes: ch } = mergeCardById(undefined, incoming);
    out.push(card);
    changes.push(...ch);
  }

  return { cards: out, changes };
}

export type IngestPlan = {
  sets: Map<
    string,
    { setName: string; fileName: string; incoming: RepoCard[] }
  >;
  warnings: string[];
  collectibleCount: number;
  tokenCount: number;
};

export function planIngest(
  apiCards: DotggCard[],
  apiSets: DotggSet[],
  options?: { includeTokens?: boolean },
): IngestPlan {
  const includeTokens = options?.includeTokens ?? false;
  const setMeta = new Map<string, DotggSet>();
  for (const s of apiSets) setMeta.set(String(s.id), s);

  const warnings: string[] = [];
  const sets = new Map<
    string,
    { setName: string; fileName: string; incoming: RepoCard[] }
  >();

  let collectibleCount = 0;
  let tokenCount = 0;

  for (const raw of apiCards) {
    const setId = String(raw.setId ?? "");
    if (!setId.startsWith("100")) continue; // skip token set 90000 etc. for main pool
    if (isTokenCard(raw)) {
      tokenCount++;
      if (!includeTokens) continue;
    } else {
      collectibleCount++;
    }

    const meta = setMeta.get(setId);
    const setName =
      meta?.name_original ||
      meta?.name ||
      raw.set_name ||
      SET_NAME_FALLBACKS[setId] ||
      setId;
    const mapped = mapDotggCardToRepo({
      ...raw,
      set_name: String(setName).replace(/^Set\s*\d+\s*:\s*/i, ""),
    });

    let bucket = sets.get(setId);
    if (!bucket) {
      bucket = {
        setName: String(setName).replace(/^Set\s*\d+\s*:\s*/i, ""),
        fileName: setFileName(
          setId,
          String(setName).replace(/^Set\s*\d+\s*:\s*/i, ""),
        ),
        incoming: [],
      };
      sets.set(setId, bucket);
    }
    bucket.incoming.push(mapped);
  }

  // Self-check: declared cardsCount vs dump
  for (const [setId, bucket] of sets) {
    const meta = setMeta.get(setId);
    if (!meta?.cardsCount) continue;
    const declared = Number(meta.cardsCount);
    const actual = bucket.incoming.length;
    if (Number.isFinite(declared) && declared !== actual) {
      warnings.push(
        `DotGG set ${setId} cardsCount=${declared} but dump has ${actual} collectible cards`,
      );
    }
  }

  return { sets, warnings, collectibleCount, tokenCount };
}

/** Ops that reference another card by display name (must exist in pool or tokens). */
export const NAMED_REFERENCE_OPS = new Set(["summon", "add_to_hand", "crest"]);

/** Walk card JSON for summon/add_to_hand/crest name references. */
export function collectNamedCardReferences(cards: RepoCard[]): Set<string> {
  const names = new Set<string>();
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    const o = obj as Record<string, unknown>;
    const op = String(o.op ?? "");
    if (
      NAMED_REFERENCE_OPS.has(op) &&
      typeof o.name === "string" &&
      o.name.trim()
    ) {
      // crest advance ops reference crest name but do not summon a card
      if (op === "crest" && o.action === "advance") return;
      names.add(o.name.trim());
    }
    for (const v of Object.values(o)) walk(v);
  }
  for (const card of cards) walk(card);
  return names;
}

export type DanglingReference = {
  name: string;
  refs: Array<{ id: string; cardName: string; op: string }>;
};

/** Collect crest display names declared via crest gain ops in card JSON trees. */
export function collectCrestNames(cards: RepoCard[]): Set<string> {
  const names = new Set<string>();
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    const o = obj as Record<string, unknown>;
    if (
      o.op === "crest" &&
      o.action === "gain" &&
      typeof o.name === "string" &&
      o.name.trim()
    ) {
      names.add(o.name.trim());
    }
    for (const v of Object.values(o)) walk(v);
  }
  for (const card of cards) walk(card);
  return names;
}

/** Scan pool cards for named references missing from all.json + token_details. */
export function scanDanglingReferences(
  poolCards: RepoCard[],
  tokens: RepoCard[],
): DanglingReference[] {
  const cardNames = new Set<string>();
  for (const c of [...poolCards, ...tokens]) {
    if (c.name) cardNames.add(c.name);
  }
  const crestNames = collectCrestNames([...poolCards, ...tokens]);

  const missing = new Map<string, DanglingReference["refs"]>();

  function walk(obj: unknown, cardId: string, cardName: string): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, cardId, cardName);
      return;
    }
    const o = obj as Record<string, unknown>;
    const op = String(o.op ?? "");
    if (
      NAMED_REFERENCE_OPS.has(op) &&
      typeof o.name === "string" &&
      o.name.trim()
    ) {
      const name = o.name.trim();
      const known = op === "crest" ? crestNames.has(name) : cardNames.has(name);
      if (!known) {
        if (!missing.has(name)) missing.set(name, []);
        missing.get(name)!.push({ id: cardId, cardName, op });
      }
    }
    for (const v of Object.values(o)) walk(v, cardId, cardName);
  }

  for (const card of poolCards) {
    walk(card, String(card.id), card.name);
  }

  return [...missing.entries()]
    .map(([name, refs]) => ({ name, refs }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type TokenIngestPlan = {
  incoming: RepoCard[];
  warnings: string[];
  basicACount: number;
  referencedPullCount: number;
  danglingAfter: DanglingReference[];
};

/**
 * Plan token ingest: full Basic A (90000) plus any token referenced by the pool.
 */
export function planTokenIngest(
  apiCards: DotggCard[],
  poolCards: RepoCard[],
  existingTokens: RepoCard[],
): TokenIngestPlan {
  const warnings: string[] = [];
  const referencedNames = collectNamedCardReferences(poolCards);
  const poolNames = new Set(poolCards.map((c) => c.name));

  const tokenByName = new Map<string, DotggCard>();
  for (const raw of apiCards) {
    if (isTokenCard(raw) || String(raw.setId) === TOKEN_SET_ID) {
      tokenByName.set(raw.name, raw);
    }
  }

  const toIngest = new Map<string, DotggCard>();
  let basicACount = 0;

  for (const raw of apiCards) {
    if (String(raw.setId) !== TOKEN_SET_ID) continue;
    toIngest.set(String(raw.id), raw);
    basicACount++;
  }

  let referencedPullCount = 0;
  for (const name of referencedNames) {
    if (poolNames.has(name)) continue;
    const raw = tokenByName.get(name);
    if (!raw) {
      warnings.push(
        `Pool references "${name}" but no token/Basic A row in DotGG dump`,
      );
      continue;
    }
    const id = String(raw.id);
    if (!toIngest.has(id)) {
      referencedPullCount++;
      toIngest.set(id, raw);
    }
  }

  const incoming = [...toIngest.values()]
    .map((raw) =>
      mapDotggCardToRepo({
        ...raw,
        set_name:
          String(raw.set_name ?? "").trim() ||
          SET_NAME_FALLBACKS[TOKEN_SET_ID] ||
          TOKEN_SET_ID,
      }),
    )
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const mergedPreview = mergeSetCards(existingTokens, incoming).cards;
  const danglingAfter = scanDanglingReferences(poolCards, mergedPreview);

  return {
    incoming,
    warnings,
    basicACount,
    referencedPullCount,
    danglingAfter,
  };
}

export function crossCheckCygamesSets(
  apiSets: DotggSet[],
  cygamesPayload: unknown,
): string[] {
  const warnings: string[] = [];
  const list =
    (cygamesPayload as { data?: { card_set_list?: { id: number }[] } })?.data
      ?.card_set_list ?? [];
  if (!Array.isArray(list) || !list.length) {
    warnings.push(
      "Cygames CardSet returned no card_set_list — could not cross-check set IDs",
    );
    return warnings;
  }
  const cyIds = new Set(list.map((s) => String(s.id)));
  const expansion = apiSets.filter(
    (s) => String(s.id).startsWith("100") && String(s.id) !== "10000",
  );
  for (const s of expansion) {
    if (!cyIds.has(String(s.id))) {
      warnings.push(
        `DotGG set ${s.id} (${s.name}) missing from Cygames CardSet list`,
      );
    }
  }
  for (const id of cyIds) {
    if (!id.startsWith("100")) continue;
    if (!apiSets.some((s) => String(s.id) === id)) {
      warnings.push(`Cygames set ${id} missing from DotGG getsets`);
    }
  }
  return warnings;
}

export function summarizeChanges(changes: MergeChange[]): {
  newCards: MergeChange[];
  filled: MergeChange[];
  textDiffs: MergeChange[];
  unchanged: number;
} {
  return {
    newCards: changes.filter((c) => c.kind === "new"),
    filled: changes.filter((c) => c.kind === "filled"),
    textDiffs: changes.filter((c) => c.kind === "text_diff"),
    unchanged: changes.filter((c) => c.kind === "unchanged").length,
  };
}

export function readSetFile(filePath: string): RepoCard[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Expected array in ${filePath}`);
  }
  return raw as RepoCard[];
}

export function writeSetFile(filePath: string, cards: RepoCard[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(cards, null, 2) + "\n");
}
