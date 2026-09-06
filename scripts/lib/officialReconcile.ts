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
  pinned: boolean;
  matchedKeywords: string[];
  matchedFile: string | null;
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
  "more",
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
 * Pin rule (crude, documented): a Q&A is pinned if any file under tests/
 * (except this generated backlog file and tests/specs/generated_specs.json)
 * contains the card id AND at least one keyword from the answer. A keyword
 * is a 4+ letter token that is not in QA_COVERAGE_STOPWORDS.
 */
export function extractAnswerKeywords(answer: string): string[] {
  const words = answer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !QA_COVERAGE_STOPWORDS.has(w));
  return [...new Set(words)];
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

export function isQaPinned(
  id: string,
  answer: string,
  corpus: Array<{ file: string; text: string }>,
): { pinned: boolean; matchedKeywords: string[]; matchedFile: string | null } {
  const keywords = extractAnswerKeywords(answer);
  if (!keywords.length) {
    return { pinned: false, matchedKeywords: [], matchedFile: null };
  }
  for (const { file, text } of corpus) {
    if (!text.includes(id)) continue;
    const hit = keywords.filter((kw) =>
      new RegExp(`\\b${kw}\\b`, "i").test(text),
    );
    if (hit.length) {
      return { pinned: true, matchedKeywords: hit, matchedFile: file };
    }
  }
  return { pinned: false, matchedKeywords: [], matchedFile: null };
}

export function coverOfficialQa(
  meta: OfficialMetaFile,
  corpus: Array<{ file: string; text: string }>,
): QaCoverageRow[] {
  const rows: QaCoverageRow[] = [];
  for (const id of officialMetaCardIds(meta)) {
    const rec = getOfficialCard(meta, id);
    if (!rec) continue;
    for (const qa of rec.questions) {
      const pin = isQaPinned(id, qa.answer, corpus);
      rows.push({
        id,
        name: rec.name,
        question: qa.question,
        answer: qa.answer,
        pinned: pin.pinned,
        matchedKeywords: pin.matchedKeywords,
        matchedFile: pin.matchedFile,
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
  pinnedCount: number;
  unpinnedCount: number;
};

export function buildOfficialReport(
  meta: OfficialMetaFile,
  root = ROOT,
): OfficialReport {
  const { allCards, byId, tokenNameToIds } = loadRepoCards(root);
  const rotation = compareRotation(meta, allCards, byId);
  const tokens = compareTokenLinks(meta, byId, tokenNameToIds);
  const corpus = loadTestCorpus(path.join(root, "tests"));
  const qaCoverage = coverOfficialQa(meta, corpus);
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
    pinnedCount: qaCoverage.filter((r) => r.pinned).length,
    unpinnedCount: qaCoverage.filter((r) => !r.pinned).length,
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
    `Pin rule: a Q&A is **pinned** if any file under \`tests/\` other than \`tests/unit/official-qa.test.ts\` and \`tests/specs/generated_specs.json\` contains the card id **and** at least one 4+ letter keyword from the answer after dropping ${QA_COVERAGE_STOPWORDS.size} stopwords (including generic game vocabulary such as destroy / cost / opponent). Otherwise **unpinned**.`,
    "",
    `Pinned: **${report.pinnedCount}**. Unpinned: **${report.unpinnedCount}**. Total: **${report.qaCoverage.length}**.`,
    "",
    table(
      ["id", "name", "status", "keywords / file", "Q / A"],
      report.qaCoverage.map((r) => [
        r.id,
        r.name,
        r.pinned ? "pinned" : "unpinned",
        r.pinned
          ? `${r.matchedKeywords.join(", ")} @ ${r.matchedFile ?? "?"}`
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
