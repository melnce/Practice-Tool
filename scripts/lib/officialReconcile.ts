/**
 * Reconciliation of official Cygames catalog vs repo heuristic / authored
 * effects / tests / owner rulings. Findings only — does not change engine data.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  collectSetIds,
  isRotationSetId,
  parseCardSetId,
} from "../../src/data/formats.js";
import { NAMED_REFERENCE_OPS } from "./ingestCards.js";
import {
  getOfficialCard,
  officialMetaCardIds,
  type OfficialMetaFile,
  type OfficialQuestion,
} from "./officialCards.js";
import {
  cardMatchesTitle,
  DEFAULT_SUBJECTHOOD_OPTIONS,
  listTestFiles,
  parseTestFiles,
  type AssertingBlock,
} from "./subjecthood.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export type RepoCardRow = {
  id: string;
  name: string;
  set?: unknown;
  [key: string]: unknown;
};

export type RotationMismatch = {
  id: string;
  name: string;
  official: boolean;
  heuristic: boolean;
  setId: string | null;
  source: "all.json" | "token_details.json";
};

export type TokenLinkRow = {
  sourceId: string;
  sourceName: string;
  relatedId: string;
  relatedName: string | null;
};

export type EncodedTokenRow = {
  sourceId: string;
  sourceName: string;
  tokenName: string;
  tokenId: string;
  op: string;
};

export type UnresolvedTokenName = {
  sourceId: string;
  sourceName: string;
  tokenName: string;
  op: string;
};

export type QaCoverageRow = {
  id: string;
  name: string;
  question: string;
  answer: string;
  /** Block-scoped pin with QA_PIN_BLOCK_KEYWORD_MIN (honest default). */
  pinned: boolean;
  /** Legacy file-scoped pin: card id + ≥1 keyword anywhere in the file. */
  pinnedFileScoped: boolean;
  /** Block-scoped pin requiring ≥ceil(keywords/2) keyword hits in a subject block. */
  pinnedBlockScopedHalf: boolean;
  /** Block-scoped pin with ≥1 keyword in a subject block (sensitivity row). */
  pinnedBlockScopedMin1: boolean;
  matchedKeywords: string[];
  matchedFile: string | null;
  matchedBlock: string | null;
};

export type QaRulingNote = {
  kind: "contradicts" | "refines";
  id: string;
  name: string;
  question: string;
  answer: string;
  officialQuote: string;
  repoQuote: string;
  repoSource: string;
};

const AUTHORED_KEYS = [
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
] as const;

/** Stopwords dropped when mining Q&A answers for a test-file keyword. */
export const QA_COVERAGE_STOPWORDS = new Set([
  "this",
  "that",
  "then",
  "than",
  "they",
  "them",
  "their",
  "there",
  "these",
  "those",
  "with",
  "from",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "into",
  "onto",
  "your",
  "yours",
  "itself",
  "himself",
  "herself",
  "also",
  "only",
  "just",
  "does",
  "done",
  "doing",
  "been",
  "being",
  "were",
  "was",
  "are",
  "and",
  "but",
  "for",
  "the",
  "its",
  "not",
  "yes",
  "you",
  "can",
  "may",
  "card",
  "cards",
  "when",
  "what",
  "which",
  "while",
  "after",
  "before",
  "because",
  "about",
  "over",
  "under",
  "each",
  "both",
  "same",
  "other",
  "another",
  "such",
  "very",
  // "more" kept extractable — survives in named ability phrases like
  // "Takes 1 more damage" that official Q&A and tests share.
  "most",
  "some",
  "any",
  "all",
  // Generic game vocabulary that appears in almost every test file.
  "follower",
  "followers",
  "damage",
  "effect",
  "effects",
  "ability",
  "abilities",
  "turn",
  "turns",
  "play",
  "played",
  "plays",
  "playing",
  "leader",
  "board",
  "hand",
  "deck",
  "evolve",
  "evolved",
  "evolves",
  "cost",
  "costs",
  "target",
  "targets",
  "enemy",
  "allied",
  "ally",
  "destroy",
  "destroyed",
  "destroys",
  "summon",
  "summoned",
  "summons",
  "spell",
  "spells",
  "amulet",
  "amulets",
  "fanfare",
  "draw",
  "drawn",
  "draws",
  "gain",
  "gains",
  "activate",
  "activates",
  "activated",
  "trigger",
  "triggered",
  "triggers",
  "field",
  "copy",
  "copies",
  "original",
  "during",
  "again",
  "first",
  "time",
  "times",
  "once",
  "still",
  "however",
  "instead",
  "example",
  "order",
  "opponent",
  "opponents",
  "random",
  "randomly",
  "attack",
  "attacks",
  "attacked",
  "health",
  "defense",
  "count",
  "counts",
  "counted",
  "toward",
  "towards",
  "point",
  "points",
  "remains",
  "remain",
  "remaining",
  "apply",
  "applies",
  "applied",
  "take",
  "takes",
  "taken",
  "deal",
  "deals",
  "dealt",
  "reduce",
  "reduced",
  "reduces",
  "number",
  "total",
  "current",
  "maximum",
  "already",
  "ends",
  "end",
  "start",
  "starts",
  "resolved",
  "resolve",
  "resolves",
  "given",
  "give",
  "gives",
  "select",
  "selected",
  // Question fillers with no discriminating power ("how much damage", etc.).
  "much",
]);

export function loadJsonArray<T>(filePath: string): T[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`${filePath} is not a JSON array`);
  }
  return raw as T[];
}

export function loadRepoCards(root = ROOT): {
  allCards: RepoCardRow[];
  tokens: RepoCardRow[];
  byId: Map<string, { card: RepoCardRow; source: RotationMismatch["source"] }>;
  tokenNameToIds: Map<string, string[]>;
} {
  const allCards = loadJsonArray<RepoCardRow>(
    path.join(root, "cards/all.json"),
  );
  const tokens = loadJsonArray<RepoCardRow>(
    path.join(root, "cards/token_details.json"),
  );
  const byId = new Map<
    string,
    { card: RepoCardRow; source: RotationMismatch["source"] }
  >();
  for (const card of allCards) {
    if (card?.id) byId.set(String(card.id), { card, source: "all.json" });
  }
  for (const card of tokens) {
    if (card?.id && !byId.has(String(card.id))) {
      byId.set(String(card.id), { card, source: "token_details.json" });
    }
  }
  const tokenNameToIds = new Map<string, string[]>();
  for (const card of tokens) {
    if (!card?.id || !card.name) continue;
    const name = String(card.name);
    const list = tokenNameToIds.get(name) ?? [];
    list.push(String(card.id));
    tokenNameToIds.set(name, list);
  }
  return { allCards, tokens, byId, tokenNameToIds };
}

export function compareRotation(
  meta: OfficialMetaFile,
  allCards: RepoCardRow[],
  byId: Map<string, { card: RepoCardRow; source: RotationMismatch["source"] }>,
): RotationMismatch[] {
  const allSetIds = collectSetIds(allCards);
  const mismatches: RotationMismatch[] = [];
  for (const id of officialMetaCardIds(meta)) {
    const official = getOfficialCard(meta, id);
    const repo = byId.get(id);
    if (!official || !repo) continue;
    const setId = parseCardSetId(repo.card);
    const heuristic = isRotationSetId(setId, allSetIds);
    if (heuristic !== official.is_include_rotation) {
      mismatches.push({
        id,
        name: official.name,
        official: official.is_include_rotation,
        heuristic,
        setId,
        source: repo.source,
      });
    }
  }
  return mismatches;
}

function walkNamedRefs(
  obj: unknown,
  out: Array<{ op: string; name: string }>,
): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) walkNamedRefs(item, out);
    return;
  }
  const rec = obj as Record<string, unknown>;
  const op = String(rec.op ?? "");
  if (
    NAMED_REFERENCE_OPS.has(op) &&
    typeof rec.name === "string" &&
    rec.name.trim()
  ) {
    if (!(op === "crest" && rec.action === "advance")) {
      out.push({ op, name: rec.name.trim() });
    }
  }
  for (const value of Object.values(rec)) walkNamedRefs(value, out);
}

export function collectCardNamedRefs(
  card: RepoCardRow,
): Array<{ op: string; name: string }> {
  const out: Array<{ op: string; name: string }> = [];
  for (const key of AUTHORED_KEYS) {
    walkNamedRefs(card[key], out);
  }
  return out;
}

export function compareTokenLinks(
  meta: OfficialMetaFile,
  byId: Map<string, { card: RepoCardRow; source: RotationMismatch["source"] }>,
  tokenNameToIds: Map<string, string[]>,
): {
  officialNotEncoded: TokenLinkRow[];
  encodedNotOfficial: EncodedTokenRow[];
  unresolved: UnresolvedTokenName[];
} {
  const officialNotEncoded: TokenLinkRow[] = [];
  const encodedNotOfficial: EncodedTokenRow[] = [];
  const unresolved: UnresolvedTokenName[] = [];

  for (const id of officialMetaCardIds(meta)) {
    const official = getOfficialCard(meta, id);
    const repo = byId.get(id);
    if (!official) continue;

    const encodedIds = new Set<string>();
    if (repo) {
      for (const ref of collectCardNamedRefs(repo.card)) {
        const mapped = tokenNameToIds.get(ref.name);
        if (!mapped || mapped.length !== 1) {
          unresolved.push({
            sourceId: id,
            sourceName: official.name,
            tokenName: ref.name,
            op: ref.op,
          });
          continue;
        }
        const tokenId = mapped[0]!;
        encodedIds.add(tokenId);
        if (!official.related_card_ids.includes(tokenId)) {
          encodedNotOfficial.push({
            sourceId: id,
            sourceName: official.name,
            tokenName: ref.name,
            tokenId,
            op: ref.op,
          });
        }
      }
    }

    for (const relatedId of official.related_card_ids) {
      if (relatedId === id) continue; // self-index links are not token provenance
      if (encodedIds.has(relatedId)) continue;
      const related =
        getOfficialCard(meta, relatedId) ?? byId.get(relatedId)?.card;
      officialNotEncoded.push({
        sourceId: id,
        sourceName: official.name,
        relatedId,
        relatedName: related?.name ?? null,
      });
    }
  }

  const seenUnresolved = new Set<string>();
  const uniqueUnresolved: UnresolvedTokenName[] = [];
  for (const row of unresolved) {
    const key = `${row.sourceId}\t${row.op}\t${row.tokenName}`;
    if (seenUnresolved.has(key)) continue;
    seenUnresolved.add(key);
    uniqueUnresolved.push(row);
  }

  return {
    officialNotEncoded,
    encodedNotOfficial,
    unresolved: uniqueUnresolved,
  };
}

/**
 * Block-scoped pin threshold (chosen rule): require at least this many Q&A
 * keywords inside the body of a subject asserting block. Keywords are mined
 * from question + answer (subject card name stripped). Single-keyword matches
 * are too loose on answer-only extraction; with Q+A, ≥2 survives spot-checks.
 * Also report pinnedBlockScopedHalf (≥ceil(n/2) keywords) for comparison.
 */
export const QA_PIN_BLOCK_KEYWORD_MIN = 2;

export type QaPinThreshold = "min1" | "min2" | "half";

export type QaPinResult = {
  pinnedFileScoped: boolean;
  pinnedBlockScopedMin1: boolean;
  pinnedBlockScopedMin2: boolean;
  pinnedBlockScopedHalf: boolean;
  matchedKeywords: string[];
  matchedFile: string | null;
  matchedBlock: string | null;
  fileScopedMatchedKeywords: string[];
  fileScopedMatchedFile: string | null;
};

export type QaPinBlockIndex = {
  subjectBlocks: AssertingBlock[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchAnswerKeywordsInText(
  keywords: string[],
  text: string,
): string[] {
  return keywords.filter((kw) =>
    new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text),
  );
}

export function qaPinThresholdMet(
  availableKeywordCount: number,
  matchedKeywordCount: number,
  threshold: QaPinThreshold,
): boolean {
  if (availableKeywordCount === 0 || matchedKeywordCount === 0) return false;
  if (threshold === "min1") {
    return matchedKeywordCount >= 1;
  }
  if (threshold === "min2") {
    return matchedKeywordCount >= QA_PIN_BLOCK_KEYWORD_MIN;
  }
  return matchedKeywordCount >= Math.ceil(availableKeywordCount / 2);
}

/**
 * Legacy pin rule (file-scoped): a Q&A is pinned if any file under tests/
 * contains the card id AND at least one keyword from the answer.
 */
export function isQaPinnedFileScoped(
  id: string,
  cardName: string,
  question: string,
  answer: string,
  corpus: Array<{ file: string; text: string }>,
): Pick<QaPinResult, "pinnedFileScoped" | "matchedKeywords" | "matchedFile"> & {
  pinned: boolean;
} {
  const keywords = extractQaKeywords(question, answer, cardName, id);
  if (!keywords.length) {
    return {
      pinned: false,
      pinnedFileScoped: false,
      matchedKeywords: [],
      matchedFile: null,
    };
  }
  for (const { file, text } of corpus) {
    if (!text.includes(id)) continue;
    const hit = matchAnswerKeywordsInText(keywords, text);
    if (hit.length) {
      return {
        pinned: true,
        pinnedFileScoped: true,
        matchedKeywords: hit,
        matchedFile: file,
      };
    }
  }
  return {
    pinned: false,
    pinnedFileScoped: false,
    matchedKeywords: [],
    matchedFile: null,
  };
}

/** @deprecated Use evaluateQaPin — kept for callers that only need file-scoped. */
export function isQaPinned(
  id: string,
  cardName: string,
  question: string,
  answer: string,
  corpus: Array<{ file: string; text: string }>,
): { pinned: boolean; matchedKeywords: string[]; matchedFile: string | null } {
  const result = isQaPinnedFileScoped(id, cardName, question, answer, corpus);
  return {
    pinned: result.pinned,
    matchedKeywords: result.matchedKeywords,
    matchedFile: result.matchedFile,
  };
}

export function buildQaPinBlockIndex(root = ROOT): QaPinBlockIndex {
  const testFiles = listTestFiles(root, DEFAULT_SUBJECTHOOD_OPTIONS);
  const { assertingBlocks } = parseTestFiles(
    testFiles,
    DEFAULT_SUBJECTHOOD_OPTIONS,
  );
  return {
    subjectBlocks: assertingBlocks.map((block) => ({
      ...block,
      file: path.relative(root, block.file).replace(/\\/g, "/"),
    })),
  };
}

export function evaluateQaPin(
  cardId: string,
  cardName: string,
  question: string,
  answer: string,
  corpus: Array<{ file: string; text: string }>,
  blockIndex: QaPinBlockIndex,
): QaPinResult {
  const keywords = extractQaKeywords(question, answer, cardName, cardId);
  const fileScoped = isQaPinnedFileScoped(
    cardId,
    cardName,
    question,
    answer,
    corpus,
  );
  const card = { id: cardId, name: cardName };

  let best: {
    hits: string[];
    file: string;
    composedTitle: string;
  } | null = null;

  for (const block of blockIndex.subjectBlocks) {
    const titleMatch = cardMatchesTitle(card, block.composedTitle);
    if (!titleMatch.byId && !titleMatch.byName) continue;
    const hits = matchAnswerKeywordsInText(
      keywords,
      `${block.composedTitle} ${block.bodyText}`,
    );
    if (!best || hits.length > best.hits.length) {
      best = {
        hits,
        file: block.file,
        composedTitle: block.composedTitle,
      };
    }
  }

  const matchedKeywords = best?.hits ?? [];
  const matchedFile = best?.file ?? null;
  const matchedBlock = best?.composedTitle ?? null;
  const pinnedBlockScopedMin1 = qaPinThresholdMet(
    keywords.length,
    matchedKeywords.length,
    "min1",
  );
  const pinnedBlockScopedMin2 = qaPinThresholdMet(
    keywords.length,
    matchedKeywords.length,
    "min2",
  );
  const pinnedBlockScopedHalf = qaPinThresholdMet(
    keywords.length,
    matchedKeywords.length,
    "half",
  );

  return {
    pinnedFileScoped: fileScoped.pinnedFileScoped,
    pinnedBlockScopedMin1,
    pinnedBlockScopedMin2,
    pinnedBlockScopedHalf,
    matchedKeywords,
    matchedFile,
    matchedBlock,
    fileScopedMatchedKeywords: fileScoped.matchedKeywords,
    fileScopedMatchedFile: fileScoped.matchedFile,
  };
}

/**
 * Tokenize Q&A text into pin keywords: 4+ letter tokens not in stopwords.
 */
export function tokenizeQaKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !QA_COVERAGE_STOPWORDS.has(w));
  return [...new Set(words)];
}

/** Tokens from the subject card name (and id) that must not count as keywords. */
export function subjectCardDropTokens(
  cardName: string,
  cardId: string,
): Set<string> {
  const drop = new Set(tokenizeQaKeywords(cardName));
  drop.add(cardId.toLowerCase());
  return drop;
}

export function stripSubjectCardKeywords(
  keywords: string[],
  cardName: string,
  cardId: string,
): string[] {
  const drop = subjectCardDropTokens(cardName, cardId);
  return keywords.filter((kw) => !drop.has(kw));
}

/**
 * Q&A keywords for pin checks: mined from question + answer, with the subject
 * card's own name tokens (and id) removed so a block cannot trivially self-pin.
 */
export function extractQaKeywords(
  question: string,
  answer: string,
  cardName: string,
  cardId: string,
): string[] {
  const combined = tokenizeQaKeywords(`${question} ${answer}`);
  return stripSubjectCardKeywords(combined, cardName, cardId);
}

/**
 * @deprecated Answer-only extraction — blind to content-free official answers.
 * Use extractQaKeywords for pin predicates.
 */
export function extractAnswerKeywords(answer: string): string[] {
  return tokenizeQaKeywords(answer);
}

export function loadTestCorpus(
  testsDir = path.join(ROOT, "tests"),
  skipNames: string[] = ["official-qa.test.ts", "generated_specs.json"],
): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const skip = new Set(skipNames);
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (skip.has(entry.name)) continue;
      if (!/\.(ts|js|mjs|cjs|json|md)$/.test(entry.name)) continue;
      out.push({
        file: path.relative(ROOT, full).replace(/\\/g, "/"),
        text: fs.readFileSync(full, "utf-8"),
      });
    }
  };
  walk(testsDir);
  return out;
}

export function coverOfficialQa(
  meta: OfficialMetaFile,
  corpus: Array<{ file: string; text: string }>,
  blockIndex: QaPinBlockIndex = buildQaPinBlockIndex(),
): QaCoverageRow[] {
  const rows: QaCoverageRow[] = [];
  for (const id of officialMetaCardIds(meta)) {
    const rec = getOfficialCard(meta, id);
    if (!rec) continue;
    for (const qa of rec.questions) {
      const pin = evaluateQaPin(
        id,
        rec.name,
        qa.question,
        qa.answer,
        corpus,
        blockIndex,
      );
      const blockPinned = pin.pinnedBlockScopedMin2;
      rows.push({
        id,
        name: rec.name,
        question: qa.question,
        answer: qa.answer,
        pinned: blockPinned,
        pinnedFileScoped: pin.pinnedFileScoped,
        pinnedBlockScopedMin1: pin.pinnedBlockScopedMin1,
        pinnedBlockScopedHalf: pin.pinnedBlockScopedHalf,
        matchedKeywords: blockPinned
          ? pin.matchedKeywords
          : pin.fileScopedMatchedKeywords,
        matchedFile: blockPinned ? pin.matchedFile : pin.fileScopedMatchedFile,
        matchedBlock: blockPinned ? pin.matchedBlock : null,
      });
    }
  }
  return rows;
}

function excerptAround(haystack: string, needle: string, radius = 280): string {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return "";
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + needle.length + radius);
  return haystack.slice(start, end).replace(/\s+/g, " ").trim();
}

function findQa(
  meta: OfficialMetaFile,
  id: string,
  questionIncludes: string,
): OfficialQuestion | null {
  const rec = getOfficialCard(meta, id);
  if (!rec) return null;
  return (
    rec.questions.find((q) =>
      q.question.toLowerCase().includes(questionIncludes.toLowerCase()),
    ) ?? null
  );
}

/**
 * Hand-reviewed overlaps only. A card id appearing in the rulings docs is
 * not enough — the official answer must change or tighten a written claim.
 * Owner rulings currently override; this function does not resolve them.
 */
export function compareQaToRulings(
  meta: OfficialMetaFile,
  ownerRulings: string,
  rulebook: string,
): QaRulingNote[] {
  const notes: QaRulingNote[] = [];
  const add = (
    kind: QaRulingNote["kind"],
    id: string,
    questionIncludes: string,
    repoQuote: string,
    repoSource: string,
  ) => {
    const rec = getOfficialCard(meta, id);
    const qa = findQa(meta, id, questionIncludes);
    if (!rec || !qa || !repoQuote) return;
    notes.push({
      kind,
      id,
      name: rec.name,
      question: qa.question,
      answer: qa.answer,
      officialQuote: `Q: ${qa.question} A: ${qa.answer}`,
      repoQuote,
      repoSource,
    });
  };

  add(
    "refines",
    "10012110",
    "Combo (3)",
    excerptAround(
      ownerRulings,
      'a "Fanfare: if Rally (N)" check does not count the card\'s own entry',
    ) || excerptAround(rulebook, "does **not** count the card's own entry"),
    "docs/owner-rulings.md + docs/svwb_rulebook_formatted.md",
  );

  add(
    "contradicts",
    "10904110",
    "accelerated Jailor",
    excerptAround(
      ownerRulings,
      "Playing a card via Accelerate does **not** replace its original/base cost",
    ) ||
      excerptAround(
        rulebook,
        "playing via Accelerate does **not** replace the card's printed (original) cost",
      ),
    "docs/owner-rulings.md + docs/svwb_rulebook_formatted.md",
  );

  add(
    "refines",
    "10344110",
    "super-evolved Azurifrit",
    excerptAround(
      ownerRulings,
      "even if superevolved the followers 'take damage' even if it is reduced to 0",
    ),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10154130",
    "deal 7 damage split",
    excerptAround(ownerRulings, "The split is **sequential by board age**"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10524110",
    "likelihood that its ability targets the enemy leader",
    excerptAround(ownerRulings, "'Another' means only Oluon is exempt"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10931110",
    "four allied Obsessed Test Subjects",
    excerptAround(ownerRulings, "if at least 5 **other** allied copies"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "90034330",
    "X = 1, Y = 1, Z = 1",
    excerptAround(ownerRulings, "To determine the values of X, Y, and Z"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10113130",
    "opponent's turn",
    excerptAround(ownerRulings, "Bayle, Luxglaive Warrior"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10363210",
    "Do faiths count as crests",
    excerptAround(rulebook, "The leader area holds Crest/Faith icons") ||
      excerptAround(rulebook, "Faith is a leader counter on the crest"),
    "docs/svwb_rulebook_formatted.md",
  );

  add(
    "refines",
    "10104110",
    "Arriet's Evolve and Super-Evolve",
    excerptAround(rulebook, "the follower first gains its stat boost"),
    "docs/svwb_rulebook_formatted.md",
  );

  add(
    "refines",
    "10911210",
    "summons multiple followers at once",
    excerptAround(ownerRulings, "trap in the woods is an amulet"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10903210",
    "before or after Zerael is invoked",
    excerptAround(ownerRulings, "azvaldt has to count itself"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10131310",
    "On Spellboost in my hand",
    excerptAround(
      ownerRulings,
      "Radiant Rainbow sometimes is such a dead card",
    ),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10101110",
    "only card in my hand",
    excerptAround(ownerRulings, "if it says 'select' then it's forced"),
    "docs/owner-rulings.md",
  );

  add(
    "refines",
    "10672110",
    "Substandard Puppet whose cost has been reduced",
    excerptAround(
      rulebook,
      "remaining PP is **strictly below** the card's current (effective) cost",
    ),
    "docs/svwb_rulebook_formatted.md",
  );

  return notes;
}

export type OfficialReport = {
  rotation: RotationMismatch[];
  officialNotEncoded: TokenLinkRow[];
  encodedNotOfficial: EncodedTokenRow[];
  unresolvedTokens: UnresolvedTokenName[];
  qaCoverage: QaCoverageRow[];
  qaRulings: QaRulingNote[];
  /** Block-scoped, ≥2 keywords in a subject block (honest default). */
  pinnedCount: number;
  unpinnedCount: number;
  pinnedFileScopedCount: number;
  unpinnedFileScopedCount: number;
  pinnedBlockScopedHalfCount: number;
  unpinnedBlockScopedHalfCount: number;
  pinnedBlockScopedMin1Count: number;
  unpinnedBlockScopedMin1Count: number;
};

export function summarizeQaCoverage(rows: QaCoverageRow[]): {
  total: number;
  pinnedFileScoped: number;
  unpinnedFileScoped: number;
  pinnedBlockScopedMin2: number;
  unpinnedBlockScopedMin2: number;
  pinnedBlockScopedHalf: number;
  unpinnedBlockScopedHalf: number;
  pinnedBlockScopedMin1: number;
  unpinnedBlockScopedMin1: number;
} {
  return {
    total: rows.length,
    pinnedFileScoped: rows.filter((r) => r.pinnedFileScoped).length,
    unpinnedFileScoped: rows.filter((r) => !r.pinnedFileScoped).length,
    pinnedBlockScopedMin2: rows.filter((r) => r.pinned).length,
    unpinnedBlockScopedMin2: rows.filter((r) => !r.pinned).length,
    pinnedBlockScopedHalf: rows.filter((r) => r.pinnedBlockScopedHalf).length,
    unpinnedBlockScopedHalf: rows.filter((r) => !r.pinnedBlockScopedHalf)
      .length,
    pinnedBlockScopedMin1: rows.filter((r) => r.pinnedBlockScopedMin1).length,
    unpinnedBlockScopedMin1: rows.filter((r) => !r.pinnedBlockScopedMin1)
      .length,
  };
}

export function buildOfficialReport(
  meta: OfficialMetaFile,
  root = ROOT,
): OfficialReport {
  const { allCards, byId, tokenNameToIds } = loadRepoCards(root);
  const rotation = compareRotation(meta, allCards, byId);
  const tokens = compareTokenLinks(meta, byId, tokenNameToIds);
  const corpus = loadTestCorpus(path.join(root, "tests"));
  const blockIndex = buildQaPinBlockIndex(root);
  const qaCoverage = coverOfficialQa(meta, corpus, blockIndex);
  const qaSummary = summarizeQaCoverage(qaCoverage);
  const ownerRulings = fs.readFileSync(
    path.join(root, "docs/owner-rulings.md"),
    "utf-8",
  );
  const rulebook = fs.readFileSync(
    path.join(root, "docs/svwb_rulebook_formatted.md"),
    "utf-8",
  );
  const qaRulings = compareQaToRulings(meta, ownerRulings, rulebook);
  return {
    rotation,
    officialNotEncoded: tokens.officialNotEncoded,
    encodedNotOfficial: tokens.encodedNotOfficial,
    unresolvedTokens: tokens.unresolved,
    qaCoverage,
    qaRulings,
    pinnedCount: qaSummary.pinnedBlockScopedMin2,
    unpinnedCount: qaSummary.unpinnedBlockScopedMin2,
    pinnedFileScopedCount: qaSummary.pinnedFileScoped,
    unpinnedFileScopedCount: qaSummary.unpinnedFileScoped,
    pinnedBlockScopedHalfCount: qaSummary.pinnedBlockScopedHalf,
    unpinnedBlockScopedHalfCount: qaSummary.unpinnedBlockScopedHalf,
    pinnedBlockScopedMin1Count: qaSummary.pinnedBlockScopedMin1,
    unpinnedBlockScopedMin1Count: qaSummary.unpinnedBlockScopedMin1,
  };
}

function mdEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return "_None._\n";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(mdEscape).join(" | ")} |`);
  return [head, sep, ...body, ""].join("\n");
}

export function renderOfficialReportMarkdown(
  meta: OfficialMetaFile,
  report: OfficialReport,
): string {
  const rotOfficialOnly = report.rotation.filter(
    (r) => r.official && !r.heuristic,
  );
  const rotHeuristicOnly = report.rotation.filter(
    (r) => !r.official && r.heuristic,
  );
  const lines = [
    "# Official catalog reconciliation",
    "",
    `Fetched ${meta._meta.fetched_at.slice(0, 10)} from ${meta._meta.source} (lang=${meta._meta.lang}). Catalog count=${meta._meta.count}.`,
    "",
    "## Rotation",
    "",
    "Heuristic: `isRotationSetId(parseCardSetId(card), collectSetIds(cards/all.json))` from `src/data/formats.ts` (Basic + newest 6 expansions). Official flag: `is_include_rotation`.",
    "",
    "### Official Rotation, heuristic older",
    "",
    table(
      ["id", "name", "set", "source"],
      rotOfficialOnly.map((r) => [r.id, r.name, r.setId ?? "—", r.source]),
    ),
    "### Heuristic Rotation, official older",
    "",
    table(
      ["id", "name", "set", "source"],
      rotHeuristicOnly.map((r) => [r.id, r.name, r.setId ?? "—", r.source]),
    ),
    `Total mismatches: **${report.rotation.length}**.`,
    "",
    "## Tokens",
    "",
    "Exact name→id via `cards/token_details.json` from `summon` / `add_to_hand` / `crest` ops (crest `advance` skipped). Official side is `related_card_ids`. Self-index links (`related_id === source`) are omitted from the first table — they are not token provenance.",
    "",
    "### Official links we do not encode",
    "",
    table(
      ["source", "related id", "related name"],
      report.officialNotEncoded.map((r) => [
        `${r.sourceId} ${r.sourceName}`,
        r.relatedId,
        r.relatedName ?? "(unresolved)",
      ]),
    ),
    "### Tokens we reference that the API does not link",
    "",
    table(
      ["source", "op", "token", "token id"],
      report.encodedNotOfficial.map((r) => [
        `${r.sourceId} ${r.sourceName}`,
        r.op,
        r.tokenName,
        r.tokenId,
      ]),
    ),
    "### Unresolved name mappings",
    "",
    table(
      ["source", "op", "name"],
      report.unresolvedTokens.map((r) => [
        `${r.sourceId} ${r.sourceName}`,
        r.op,
        r.tokenName,
      ]),
    ),
    "## Q&A coverage",
    "",
    "Pin predicates (measurement only — not a CI gate). Keywords: 4+ letter tokens from question + answer after dropping stopwords and the subject card name.",
    "",
    table(
      ["scope", "threshold", "pinned", "unpinned", "total"],
      [
        [
          "file",
          "≥1 keyword anywhere in file with card id",
          String(report.pinnedFileScopedCount),
          String(report.unpinnedFileScopedCount),
          String(report.qaCoverage.length),
        ],
        [
          "block (subject `it`/`test`)",
          "≥1 keyword in asserting block",
          String(report.pinnedBlockScopedMin1Count),
          String(report.unpinnedBlockScopedMin1Count),
          String(report.qaCoverage.length),
        ],
        [
          "block (subject `it`/`test`)",
          `≥${QA_PIN_BLOCK_KEYWORD_MIN} keywords in asserting block`,
          String(report.pinnedCount),
          String(report.unpinnedCount),
          String(report.qaCoverage.length),
        ],
        [
          "block (subject `it`/`test`)",
          "≥ceil(n/2) keywords in asserting block",
          String(report.pinnedBlockScopedHalfCount),
          String(report.unpinnedBlockScopedHalfCount),
          String(report.qaCoverage.length),
        ],
      ],
    ),
    "",
    `Default \`pinned\` field: block-scoped, ≥${QA_PIN_BLOCK_KEYWORD_MIN} keywords (subject block from \`subjecthood.ts\` title matcher). Legacy file-scoped verdict kept as \`pinnedFileScoped\`.`,
    "",
    table(
      ["id", "name", "status", "keywords / block", "Q / A"],
      report.qaCoverage.map((r) => [
        r.id,
        r.name,
        r.pinned
          ? "pinned"
          : r.pinnedFileScoped
            ? "unpinned (was file-scoped)"
            : "unpinned",
        r.pinned || r.pinnedFileScoped
          ? `${r.matchedKeywords.join(", ")} @ ${r.matchedFile ?? "?"}${r.matchedBlock ? ` — ${r.matchedBlock}` : ""}`
          : "—",
        `Q: ${r.question} / A: ${r.answer}`,
      ]),
    ),
    "## Q&A vs owner rulings / rulebook",
    "",
    "Owner rulings currently override printed text and official Q&A. Do not resolve here — the owner decides.",
    "",
    table(
      ["kind", "id", "name", "official", "repo"],
      report.qaRulings.map((r) => [
        r.kind,
        r.id,
        r.name,
        r.officialQuote,
        `(${r.repoSource}) ${r.repoQuote}`,
      ]),
    ),
  ];
  return lines.join("\n");
}

export async function writeOfficialReport(
  meta: OfficialMetaFile,
  reportDir: string,
  root = ROOT,
): Promise<OfficialReport> {
  const report = buildOfficialReport(meta, root);
  fs.mkdirSync(reportDir, { recursive: true });
  const { writeFormattedMarkdown } = await import("./officialCards.js");
  await writeFormattedMarkdown(
    path.join(reportDir, "reconciliation.md"),
    renderOfficialReportMarkdown(meta, report),
  );
  return report;
}
