/**
 * Compare repo card data (cards/all.json + token_details.json) against a
 * datamined client dump (sva.hypd.asia schema).
 */

import { createHash } from "node:crypto";
import { stripSkillText } from "./ingestCards.js";

export const DEFAULT_DUMP_URL = "https://sva.hypd.asia/data/cards.json";

/** Keywords whose presence/absence marks a semantic text drift (case-insensitive). */
export const DRIFT_KEYWORDS = [
  "Super-Evolve",
  "Last Words",
  "Earth Rite",
  "Spellboost",
  "Necromancy",
  "Crystallize",
  "Accelerate",
  "Countdown",
  "Intimidate",
  "Reanimate",
  "Fanfare",
  "Enhance",
  "Barrier",
  "Ambush",
  "Engage",
  "Evolve",
  "Storm",
  "Combo",
  "Drain",
  "Rally",
  "Bane",
  "Fuse",
  "Mode",
  "Rush",
  "Ward",
  "Aura",
] as const;

export type DriftKind =
  | "missing_in_dump"
  | "missing_in_ours"
  | "stat_cost"
  | "stat_attack"
  | "stat_defense"
  | "stat_type"
  | "text_main_semantic"
  | "text_main_wording"
  | "alt_mode_missing"
  | "alt_mode_semantic"
  | "alt_mode_wording";

export type AllowlistEntry = {
  id: string;
  kind: DriftKind;
  reason: string;
};

export type OurCard = {
  id: string;
  name: string;
  cost: string;
  attack?: string;
  defense?: string;
  type: string;
  description?: string;
  specific_effects?: Array<{ name?: string; skill_text?: string }>;
};

export type DumpRecord = {
  card_id: number;
  card_set_id: number;
  name_eng: string;
  cost: number;
  atk: number | null;
  life: number | null;
  type: number;
  skill_texts?: Array<{ text_eng?: string | null }>;
  alt_modes?: Array<{ type_key?: string; text_eng?: string | null }>;
  evolves_to?: unknown;
};

export type MissingRow = {
  id: string;
  name: string;
  source: "ours" | "dump";
};

export type StatDriftRow = {
  id: string;
  name: string;
  field: "cost" | "attack" | "defense" | "type";
  ours: string;
  dump: string;
};

export type TextDriftRow = {
  id: string;
  name: string;
  mode: "main" | "Crest" | "Faith" | "Crystallize" | "Accelerate";
  classification: "semantic" | "wording";
  ours: string;
  dump: string;
};

export type AltModeMissingRow = {
  id: string;
  name: string;
  mode: "Crest" | "Faith" | "Crystallize" | "Accelerate";
  side: "ours" | "dump";
};

export type DriftReport = {
  fetchTimestamp: string;
  dumpSha256: string;
  dumpRecordCount: number;
  oursRecordCount: number;
  missingInDump: MissingRow[];
  missingInOurs: MissingRow[];
  statDrift: StatDriftRow[];
  textSemantic: TextDriftRow[];
  textWording: TextDriftRow[];
  altModeMissing: AltModeMissingRow[];
  altModeSemantic: TextDriftRow[];
  altModeWording: TextDriftRow[];
  exitCode: number;
};

const DUMP_TYPE_TO_OUR: Record<number, string> = {
  1: "Follower",
  2: "Amulet",
  3: "Spell",
};

const ALT_MODE_DUMP_TO_OUR: Record<
  string,
  "Crest" | "Faith" | "Crystallize" | "Accelerate"
> = {
  crest: "Crest",
  faith: "Faith",
  crystallize: "Crystallize",
  accelerate: "Accelerate",
};

const ALT_MODES = ["Crest", "Faith", "Crystallize", "Accelerate"] as const;
type AltModeName = (typeof ALT_MODES)[number];

export function normalizeCardText(raw: string | null | undefined): string {
  if (!raw) return "";
  return stripSkillText(String(raw))
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractIntegers(text: string): number[] {
  const matches = text.match(/\d+/g);
  return (matches ?? []).map(Number).sort((a, b) => a - b);
}

export function extractKeywordSet(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const kw of DRIFT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      found.add(kw.toLowerCase());
    }
  }
  return found;
}

export function classifyTextDrift(
  oursRaw: string,
  dumpRaw: string,
): "match" | "semantic" | "wording" {
  const ours = normalizeCardText(oursRaw);
  const dump = normalizeCardText(dumpRaw);
  if (ours === dump) return "match";

  const oursInts = extractIntegers(ours);
  const dumpInts = extractIntegers(dump);
  if (
    oursInts.length !== dumpInts.length ||
    oursInts.some((v, i) => v !== dumpInts[i])
  ) {
    return "semantic";
  }

  const oursKw = extractKeywordSet(ours);
  const dumpKw = extractKeywordSet(dump);
  if (oursKw.size !== dumpKw.size) return "semantic";
  for (const kw of oursKw) {
    if (!dumpKw.has(kw)) return "semantic";
  }

  return "wording";
}

function isAllowlisted(
  id: string,
  kind: DriftKind,
  allowlist: AllowlistEntry[],
): boolean {
  return allowlist.some((e) => e.id === id && e.kind === kind);
}

function dumpMainText(record: DumpRecord): string {
  return (record.skill_texts ?? [])
    .map((s) => s.text_eng ?? "")
    .filter(Boolean)
    .join("\n");
}

function dumpAltModes(
  record: DumpRecord,
): Partial<Record<AltModeName, string>> {
  const out: Partial<Record<AltModeName, string>> = {};
  for (const mode of record.alt_modes ?? []) {
    const key = mode.type_key?.toLowerCase() ?? "";
    const mapped = ALT_MODE_DUMP_TO_OUR[key];
    if (mapped) out[mapped] = mode.text_eng ?? "";
  }
  return out;
}

function ourAltModes(card: OurCard): Partial<Record<AltModeName, string>> {
  const out: Partial<Record<AltModeName, string>> = {};
  for (const effect of card.specific_effects ?? []) {
    const name = effect.name as AltModeName | undefined;
    if (name && (ALT_MODES as readonly string[]).includes(name)) {
      out[name] = effect.skill_text ?? "";
    }
  }
  return out;
}

function statString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function computeExitCode(report: Omit<DriftReport, "exitCode">): number {
  if (
    report.missingInDump.length > 0 ||
    report.missingInOurs.length > 0 ||
    report.statDrift.length > 0 ||
    report.textSemantic.length > 0 ||
    report.altModeSemantic.length > 0
  ) {
    return 1;
  }
  return 0;
}

export type CompareCardsDriftInput = {
  oursCards: OurCard[];
  dumpRecords: DumpRecord[];
  allowlist?: AllowlistEntry[];
  fetchTimestamp?: string;
  dumpSha256?: string;
};

export function compareCardsDrift(input: CompareCardsDriftInput): DriftReport {
  const allowlist = input.allowlist ?? [];
  const fetchTimestamp = input.fetchTimestamp ?? new Date().toISOString();
  const dumpSha256 =
    input.dumpSha256 ??
    createHash("sha256")
      .update(JSON.stringify(input.dumpRecords))
      .digest("hex");

  const oursById = new Map(input.oursCards.map((c) => [c.id, c]));
  const dumpById = new Map(
    input.dumpRecords.map((r) => [String(r.card_id), r]),
  );

  const missingInDump: MissingRow[] = [];
  const missingInOurs: MissingRow[] = [];
  const statDrift: StatDriftRow[] = [];
  const textSemantic: TextDriftRow[] = [];
  const textWording: TextDriftRow[] = [];
  const altModeMissing: AltModeMissingRow[] = [];
  const altModeSemantic: TextDriftRow[] = [];
  const altModeWording: TextDriftRow[] = [];

  for (const card of input.oursCards) {
    if (!dumpById.has(card.id)) {
      if (!isAllowlisted(card.id, "missing_in_dump", allowlist)) {
        missingInDump.push({ id: card.id, name: card.name, source: "ours" });
      }
    }
  }

  for (const record of input.dumpRecords) {
    const id = String(record.card_id);
    if (!oursById.has(id)) {
      if (!isAllowlisted(id, "missing_in_ours", allowlist)) {
        missingInOurs.push({
          id,
          name: record.name_eng,
          source: "dump",
        });
      }
    }
  }

  for (const card of input.oursCards) {
    const record = dumpById.get(card.id);
    if (!record) continue;

    const oursCost = statString(card.cost);
    const dumpCost = statString(record.cost);
    if (oursCost !== dumpCost) {
      if (!isAllowlisted(card.id, "stat_cost", allowlist)) {
        statDrift.push({
          id: card.id,
          name: card.name,
          field: "cost",
          ours: oursCost,
          dump: dumpCost,
        });
      }
    }

    const dumpType = DUMP_TYPE_TO_OUR[record.type] ?? String(record.type);
    if (card.type !== dumpType) {
      if (!isAllowlisted(card.id, "stat_type", allowlist)) {
        statDrift.push({
          id: card.id,
          name: card.name,
          field: "type",
          ours: card.type,
          dump: dumpType,
        });
      }
    }

    if (card.type === "Follower") {
      const oursAtk = statString(card.attack);
      const dumpAtk = statString(record.atk);
      if (oursAtk !== dumpAtk) {
        if (!isAllowlisted(card.id, "stat_attack", allowlist)) {
          statDrift.push({
            id: card.id,
            name: card.name,
            field: "attack",
            ours: oursAtk,
            dump: dumpAtk,
          });
        }
      }

      const oursDef = statString(card.defense);
      const dumpDef = statString(record.life);
      if (oursDef !== dumpDef) {
        if (!isAllowlisted(card.id, "stat_defense", allowlist)) {
          statDrift.push({
            id: card.id,
            name: card.name,
            field: "defense",
            ours: oursDef,
            dump: dumpDef,
          });
        }
      }
    }

    const mainOurs = card.description ?? "";
    const mainDump = dumpMainText(record);
    const mainClass = classifyTextDrift(mainOurs, mainDump);
    if (mainClass === "semantic") {
      if (!isAllowlisted(card.id, "text_main_semantic", allowlist)) {
        textSemantic.push({
          id: card.id,
          name: card.name,
          mode: "main",
          classification: "semantic",
          ours: mainOurs,
          dump: mainDump,
        });
      }
    } else if (mainClass === "wording") {
      if (!isAllowlisted(card.id, "text_main_wording", allowlist)) {
        textWording.push({
          id: card.id,
          name: card.name,
          mode: "main",
          classification: "wording",
          ours: mainOurs,
          dump: mainDump,
        });
      }
    }

    const oursModes = ourAltModes(card);
    const dumpModes = dumpAltModes(record);

    for (const mode of ALT_MODES) {
      const hasOurs = mode in oursModes;
      const hasDump = mode in dumpModes;
      if (hasOurs && !hasDump) {
        if (!isAllowlisted(card.id, "alt_mode_missing", allowlist)) {
          altModeMissing.push({
            id: card.id,
            name: card.name,
            mode,
            side: "ours",
          });
        }
      } else if (hasDump && !hasOurs) {
        if (!isAllowlisted(card.id, "alt_mode_missing", allowlist)) {
          altModeMissing.push({
            id: card.id,
            name: card.name,
            mode,
            side: "dump",
          });
        }
      } else if (hasOurs && hasDump) {
        const altClass = classifyTextDrift(
          oursModes[mode] ?? "",
          dumpModes[mode] ?? "",
        );
        if (altClass === "semantic") {
          if (!isAllowlisted(card.id, "alt_mode_semantic", allowlist)) {
            altModeSemantic.push({
              id: card.id,
              name: card.name,
              mode,
              classification: "semantic",
              ours: oursModes[mode] ?? "",
              dump: dumpModes[mode] ?? "",
            });
          }
        } else if (altClass === "wording") {
          if (!isAllowlisted(card.id, "alt_mode_wording", allowlist)) {
            altModeWording.push({
              id: card.id,
              name: card.name,
              mode,
              classification: "wording",
              ours: oursModes[mode] ?? "",
              dump: dumpModes[mode] ?? "",
            });
          }
        }
      }
    }
  }

  const partial = {
    fetchTimestamp,
    dumpSha256,
    dumpRecordCount: input.dumpRecords.length,
    oursRecordCount: input.oursCards.length,
    missingInDump,
    missingInOurs,
    statDrift,
    textSemantic,
    textWording,
    altModeMissing,
    altModeSemantic,
    altModeWording,
  };

  return {
    ...partial,
    exitCode: computeExitCode(partial),
  };
}

function mdEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function renderTable(headers: string[], rows: string[][]): string {
  if (!rows.length) return "_None._\n";
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`),
  ];
  return `${lines.join("\n")}\n`;
}

export function renderDriftMarkdown(report: DriftReport): string {
  const sections: string[] = [
    "# Cards drift report",
    "",
    `- Fetch timestamp: ${report.fetchTimestamp}`,
    `- Dump SHA-256: \`${report.dumpSha256}\``,
    `- Dump records: ${report.dumpRecordCount}`,
    `- Ours records: ${report.oursRecordCount}`,
    `- Exit code: ${report.exitCode}`,
    "",
    "## Summary",
    "",
    "| Category | Count |",
    "| --- | ---: |",
    `| Missing in dump | ${report.missingInDump.length} |`,
    `| Missing in ours | ${report.missingInOurs.length} |`,
    `| Stat drift | ${report.statDrift.length} |`,
    `| Text semantic | ${report.textSemantic.length} |`,
    `| Text wording | ${report.textWording.length} |`,
    `| Alt mode missing | ${report.altModeMissing.length} |`,
    `| Alt mode semantic | ${report.altModeSemantic.length} |`,
    `| Alt mode wording | ${report.altModeWording.length} |`,
    "",
    "## Missing in dump",
    "",
    renderTable(
      ["ID", "Name"],
      report.missingInDump.map((r) => [r.id, r.name]),
    ),
    "## Missing in ours",
    "",
    renderTable(
      ["ID", "Name"],
      report.missingInOurs.map((r) => [r.id, r.name]),
    ),
    "## Stat drift",
    "",
    renderTable(
      ["ID", "Name", "Field", "Ours", "Dump"],
      report.statDrift.map((r) => [r.id, r.name, r.field, r.ours, r.dump]),
    ),
    "## Text drift (semantic)",
    "",
    renderTable(
      ["ID", "Name", "Mode", "Ours", "Dump"],
      report.textSemantic.map((r) => [r.id, r.name, r.mode, r.ours, r.dump]),
    ),
    "## Text drift (wording)",
    "",
    renderTable(
      ["ID", "Name", "Mode", "Ours", "Dump"],
      report.textWording.map((r) => [r.id, r.name, r.mode, r.ours, r.dump]),
    ),
    "## Alt mode missing",
    "",
    renderTable(
      ["ID", "Name", "Mode", "Side"],
      report.altModeMissing.map((r) => [r.id, r.name, r.mode, r.side]),
    ),
    "## Alt mode drift (semantic)",
    "",
    renderTable(
      ["ID", "Name", "Mode", "Ours", "Dump"],
      report.altModeSemantic.map((r) => [r.id, r.name, r.mode, r.ours, r.dump]),
    ),
    "## Alt mode drift (wording)",
    "",
    renderTable(
      ["ID", "Name", "Mode", "Ours", "Dump"],
      report.altModeWording.map((r) => [r.id, r.name, r.mode, r.ours, r.dump]),
    ),
  ];
  return sections.join("\n");
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const OUR_TYPE_TO_DUMP: Record<string, number> = {
  Follower: 1,
  Amulet: 2,
  Spell: 3,
};

const ALT_MODE_OUR_TO_DUMP: Record<AltModeName, string> = {
  Crest: "crest",
  Faith: "faith",
  Crystallize: "crystallize",
  Accelerate: "accelerate",
};

function inferCardSetId(id: string): number {
  if (id.startsWith("90")) return 90000;
  return parseInt(id.slice(0, 5), 10);
}

/** Convert repo cards into dump-shaped records (for local gate proofs). */
export function convertOurCardsToDump(cards: OurCard[]): DumpRecord[] {
  return cards.map((card) => {
    const isFollower = card.type === "Follower";
    const record: DumpRecord = {
      card_id: Number(card.id),
      card_set_id: inferCardSetId(card.id),
      name_eng: card.name,
      cost: Number(card.cost),
      atk: isFollower ? Number(card.attack ?? 0) : null,
      life: isFollower ? Number(card.defense ?? 0) : null,
      type: OUR_TYPE_TO_DUMP[card.type] ?? 1,
      skill_texts: [{ text_eng: card.description ?? "" }],
    };
    const altModes = (card.specific_effects ?? [])
      .filter(
        (effect): effect is { name: AltModeName; skill_text?: string } =>
          !!effect.name &&
          (ALT_MODES as readonly string[]).includes(effect.name),
      )
      .map((effect) => ({
        type_key: ALT_MODE_OUR_TO_DUMP[effect.name],
        text_eng: effect.skill_text ?? "",
      }));
    if (altModes.length) record.alt_modes = altModes;
    return record;
  });
}

export async function fetchDumpRecords(
  url: string,
  timeoutMs = 60_000,
): Promise<{ records: DumpRecord[]; raw: string; sha256: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "practice-tool-cards-drift/1.0",
      },
    });
    if (!res.ok) {
      throw new Error(`GET ${url} failed: HTTP ${res.status}`);
    }
    const raw = await res.text();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Dump JSON is not an array");
    }
    return {
      records: parsed as DumpRecord[],
      raw,
      sha256: sha256Hex(raw),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`GET ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
