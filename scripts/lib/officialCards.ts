/**
 * Cygames official card catalog: Q&A, Rotation flag, related-card ids.
 *
 * Live host: https://shadowverse-wb.com
 *   GET /web/CardList/cardList?offset=<n>&include_token=1   (header Lang)
 *   GET /web/CardList/card?card_id=<id>                     (header Lang)
 *
 * Paging follows FabulousCupcake/svwbdb data/cards/01-download.sh:
 * increment offset by data.sort_card_id_list.length until offset >= data.count,
 * then assert the union of sort lists has exactly `count` distinct ids.
 */

import fs from "fs";
import path from "path";
import * as prettier from "prettier";
import { writeFormattedJson } from "./formatJson.js";

export const OFFICIAL_ORIGIN = "https://shadowverse-wb.com";
export const OFFICIAL_CARD_LIST_PATH = "/web/CardList/cardList";
export const OFFICIAL_CARD_PATH = "/web/CardList/card";

/** ≤ 4 requests/second. */
export const OFFICIAL_MIN_INTERVAL_MS = 250;
export const OFFICIAL_TIMEOUT_MS = 30_000;
export const OFFICIAL_MAX_ATTEMPTS = 2; // initial + one retry on 5xx

export type OfficialQuestion = {
  question: string;
  answer: string;
};

export type OfficialCardRecord = {
  name: string;
  is_token: boolean;
  card_set_id: number;
  is_include_rotation: boolean;
  deck_enabled_num: number;
  related_card_ids: string[];
  questions: OfficialQuestion[];
};

export type OfficialMetaHeader = {
  fetched_at: string;
  count: number;
  lang: string;
  source: string;
};

export type OfficialMetaFile = {
  _meta: OfficialMetaHeader;
  [cardId: string]: OfficialCardRecord | OfficialMetaHeader;
};

export type OfficialCardCommon = {
  card_id?: unknown;
  name?: unknown;
  questions?: unknown;
  is_token?: unknown;
  is_include_rotation?: unknown;
  deck_enabled_num?: unknown;
  related_card_ids?: unknown;
  card_set_id?: unknown;
  original_card_id?: unknown;
  skill_text?: unknown;
};

export type OfficialCardListData = {
  count?: unknown;
  sort_card_id_list?: unknown;
  cards?: unknown;
  card_details?: unknown;
  specific_effect_card_info?: unknown;
};

export type OfficialCardListResponse = {
  data?: OfficialCardListData;
  data_headers?: unknown;
};

export type OfficialFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type OfficialClient = {
  fetch?: OfficialFetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** When set, list/card HTTP is skipped (tests + --input). */
  getCardList?: (offset: number) => Promise<OfficialCardListResponse>;
  getCard?: (cardId: string) => Promise<OfficialCardListResponse>;
};

export class OfficialCardsError extends Error {
  readonly missingIds: string[];
  constructor(message: string, missingIds: string[] = []) {
    super(message);
    this.name = "OfficialCardsError";
    this.missingIds = missingIds;
  }
}

export function officialCardListUrl(offset: number): string {
  const url = new URL(OFFICIAL_CARD_LIST_PATH, OFFICIAL_ORIGIN);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("include_token", "1");
  return url.toString();
}

export function officialCardUrl(cardId: string): string {
  const url = new URL(OFFICIAL_CARD_PATH, OFFICIAL_ORIGIN);
  url.searchParams.set("card_id", String(cardId));
  return url.toString();
}

/** Strip Cygames skill/Q&A markup (`<b>`, `<color=…>`, `<i>`, `<hr>`). */
export function stripOfficialMarkup(html: string | null | undefined): string {
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

export function asCardId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

export function sortCardIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => Number(a) - Number(b));
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "1" || s === "true") return true;
    if (s === "0" || s === "false") return false;
  }
  return Boolean(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    const id = asCardId(item);
    if (id) ids.push(id);
  }
  return sortCardIds(ids);
}

function asQuestions(value: unknown): OfficialQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: OfficialQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { question?: unknown; answer?: unknown };
    const question = stripOfficialMarkup(String(rec.question ?? ""));
    const answer = stripOfficialMarkup(String(rec.answer ?? ""));
    if (!question && !answer) continue;
    out.push({ question, answer });
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getCardDetailsMap(
  data: OfficialCardListData | undefined,
): Record<string, { common?: OfficialCardCommon }> {
  const raw = data?.card_details;
  if (!isRecord(raw)) return {};
  const out: Record<string, { common?: OfficialCardCommon }> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = asCardId(key);
    if (!id || !isRecord(value)) continue;
    const common = value.common;
    out[id] = {
      common: isRecord(common) ? (common as OfficialCardCommon) : undefined,
    };
  }
  return out;
}

export function getRelatedMap(
  data: OfficialCardListData | undefined,
): Record<string, string[]> {
  const raw = data?.cards;
  if (!isRecord(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = asCardId(key);
    if (!id || !isRecord(value)) continue;
    out[id] = asStringArray(value.related_card_ids);
  }
  return out;
}

export function readSortCardIdList(
  data: OfficialCardListData | undefined,
): string[] {
  const raw = data?.sort_card_id_list;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    const id = asCardId(item);
    if (id) ids.push(id);
  }
  return ids;
}

export function normalizeOfficialCard(
  common: OfficialCardCommon,
  relatedFromIndex?: string[],
): OfficialCardRecord | null {
  const id = asCardId(common.card_id);
  if (!id) return null;
  const name = stripOfficialMarkup(String(common.name ?? "")).trim();
  if (!name) return null;
  const fromCommon = asStringArray(common.related_card_ids);
  const fromIndex = relatedFromIndex ? sortCardIds(relatedFromIndex) : [];
  // Index (`data.cards`) is the live source; common.related_card_ids is often null.
  const related_card_ids = fromIndex.length ? fromIndex : fromCommon;
  return {
    name,
    is_token: asBoolean(common.is_token),
    card_set_id: asNumber(common.card_set_id),
    is_include_rotation: asBoolean(common.is_include_rotation),
    deck_enabled_num: asNumber(common.deck_enabled_num, 3),
    related_card_ids,
    questions: asQuestions(common.questions),
  };
}

export type AssembledCatalog = {
  count: number;
  expectedIds: string[];
  records: Map<string, OfficialCardRecord>;
  missingIds: string[];
};

/**
 * Merge one or more cardList/card responses into a catalog keyed by
 * `sort_card_id_list` (not by extra related cards that leak into card_details).
 */
export function assembleOfficialCatalog(
  pages: OfficialCardListResponse[],
): AssembledCatalog {
  const expected: string[] = [];
  const seenExpected = new Set<string>();
  const records = new Map<string, OfficialCardRecord>();
  let count = 0;

  for (const page of pages) {
    const data = page.data;
    if (!data) continue;
    const pageCount = asNumber(data.count);
    if (pageCount > 0) count = pageCount;
    const sortIds = readSortCardIdList(data);
    for (const id of sortIds) {
      if (!seenExpected.has(id)) {
        seenExpected.add(id);
        expected.push(id);
      }
    }
    const details = getCardDetailsMap(data);
    const related = getRelatedMap(data);
    const ingestIds = new Set([...sortIds, ...Object.keys(details)]);
    for (const id of ingestIds) {
      const common = details[id]?.common;
      if (!common) continue;
      const rec = normalizeOfficialCard(common, related[id]);
      if (!rec) continue;
      const existing = records.get(id);
      if (!existing) {
        records.set(id, rec);
        continue;
      }
      // Prefer a record that already has related ids / questions if a later
      // related-only leak is thinner.
      const mergedRelated = sortCardIds([
        ...existing.related_card_ids,
        ...rec.related_card_ids,
      ]);
      const mergedQuestions =
        rec.questions.length >= existing.questions.length
          ? rec.questions
          : existing.questions;
      records.set(id, {
        ...existing,
        ...rec,
        related_card_ids: mergedRelated,
        questions: mergedQuestions,
      });
    }
  }

  const expectedIds = sortCardIds(expected);
  const missingIds = expectedIds.filter((id) => !records.has(id));
  return { count, expectedIds, records, missingIds };
}

export function buildOfficialMetaFile(
  assembled: AssembledCatalog,
  header: OfficialMetaHeader,
): OfficialMetaFile {
  const out: OfficialMetaFile = {
    _meta: {
      fetched_at: header.fetched_at,
      count: header.count,
      lang: header.lang,
      source: header.source,
    },
  };
  for (const id of assembled.expectedIds) {
    const rec = assembled.records.get(id);
    if (rec) out[id] = rec;
  }
  return out;
}

export function officialMetaCardIds(file: OfficialMetaFile): string[] {
  return sortCardIds(
    Object.keys(file).filter((k) => k !== "_meta" && /^\d+$/.test(k)),
  );
}

export function getOfficialCard(
  file: OfficialMetaFile,
  id: string,
): OfficialCardRecord | undefined {
  const rec = file[id];
  if (!rec || rec === file._meta) return undefined;
  return rec as OfficialCardRecord;
}

export function renderOfficialQaMarkdown(file: OfficialMetaFile): string {
  const ids = officialMetaCardIds(file);
  let entries = 0;
  let cardsWithQa = 0;
  const sections: string[] = [];
  for (const id of ids) {
    const rec = getOfficialCard(file, id);
    if (!rec || rec.questions.length === 0) continue;
    cardsWithQa += 1;
    entries += rec.questions.length;
    const lines = [`## ${id} ${rec.name}`, ""];
    for (const qa of rec.questions) {
      lines.push(`**Q:** ${qa.question}`, "", `**A:** ${qa.answer}`, "");
    }
    sections.push(lines.join("\n"));
  }
  const fetched = file._meta.fetched_at.slice(0, 10);
  const header = [
    "# Official Cygames per-card Q&A",
    "",
    `Fetched ${fetched} from ${file._meta.source} (lang=${file._meta.lang}). ${entries} Q&A ${
      entries === 1 ? "entry" : "entries"
    } across ${cardsWithQa} ${
      cardsWithQa === 1 ? "card" : "cards"
    } (${file._meta.count} catalog ids).`,
    "",
  ];
  return `${header.join("\n")}${sections.join("\n")}`.trim() + "\n";
}

export async function writeFormattedMarkdown(
  outPath: string,
  markdown: string,
): Promise<void> {
  const formatted = await prettier.format(markdown, {
    ...(await prettier.resolveConfig(outPath)),
    parser: "markdown",
  });
  fs.writeFileSync(outPath, formatted);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function officialGetJson(
  url: string,
  lang: string,
  client: OfficialClient = {},
): Promise<unknown> {
  const fetchImpl = client.fetch ?? globalThis.fetch;
  const sleep = client.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= OFFICIAL_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OFFICIAL_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        headers: { Lang: lang, Accept: "application/json" },
        signal: controller.signal,
      });
      if (res.status >= 500 && attempt < OFFICIAL_MAX_ATTEMPTS) {
        lastErr = new OfficialCardsError(
          `GET ${url} failed: HTTP ${res.status}`,
        );
        await sleep(OFFICIAL_MIN_INTERVAL_MS);
        continue;
      }
      if (!res.ok) {
        throw new OfficialCardsError(`GET ${url} failed: HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted/i.test(err.message));
      if (aborted && attempt < OFFICIAL_MAX_ATTEMPTS) {
        await sleep(OFFICIAL_MIN_INTERVAL_MS);
        continue;
      }
      if (attempt >= OFFICIAL_MAX_ATTEMPTS) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new OfficialCardsError(`GET ${url} failed`);
}

export type CollectedOfficial = {
  pages: OfficialCardListResponse[];
  fallbackPages: OfficialCardListResponse[];
  assembled: AssembledCatalog;
  meta: OfficialMetaFile;
};

export async function collectOfficialCards(
  options: {
    lang?: string;
    client?: OfficialClient;
    source?: string;
  } = {},
): Promise<CollectedOfficial> {
  const lang = options.lang ?? "en";
  const client = options.client ?? {};
  const sleep = client.sleep ?? defaultSleep;
  const pages: OfficialCardListResponse[] = [];
  let offset = 0;
  let totalCount = 1;
  let lastStamp = 0;

  const pace = async () => {
    const now = Date.now();
    const wait = OFFICIAL_MIN_INTERVAL_MS - (now - lastStamp);
    if (lastStamp && wait > 0) await sleep(wait);
    lastStamp = Date.now();
  };

  const getList =
    client.getCardList ??
    (async (off: number) => {
      await pace();
      return (await officialGetJson(
        officialCardListUrl(off),
        lang,
        client,
      )) as OfficialCardListResponse;
    });

  while (offset < totalCount) {
    const page = await getList(offset);
    pages.push(page);
    const data = page.data;
    if (!data) {
      throw new OfficialCardsError(
        `cardList offset=${offset} returned no data`,
      );
    }
    const pageCount = readSortCardIdList(data).length;
    const nextTotal = asNumber(data.count);
    if (nextTotal > 0) totalCount = nextTotal;
    if (pageCount <= 0) {
      throw new OfficialCardsError(
        `cardList offset=${offset} returned empty sort_card_id_list (stalled at ${offset}/${totalCount})`,
      );
    }
    offset += pageCount;
  }

  let assembled = assembleOfficialCatalog(pages);
  const fallbackPages: OfficialCardListResponse[] = [];

  const getCard =
    client.getCard ??
    (async (cardId: string) => {
      await pace();
      return (await officialGetJson(
        officialCardUrl(cardId),
        lang,
        client,
      )) as OfficialCardListResponse;
    });

  if (assembled.expectedIds.length !== assembled.count) {
    // sort_card_id_list union is short of count — we cannot name the missing
    // ids from the list alone. Surface the gap so the caller can fail.
    throw new OfficialCardsError(
      `sort_card_id_list union is ${assembled.expectedIds.length} ids but count is ${assembled.count}`,
      [],
    );
  }

  if (assembled.missingIds.length) {
    for (const id of assembled.missingIds) {
      const page = await getCard(id);
      fallbackPages.push(page);
    }
    assembled = assembleOfficialCatalog([...pages, ...fallbackPages]);
  }

  if (
    assembled.expectedIds.length !== assembled.count ||
    assembled.missingIds.length
  ) {
    const missing =
      assembled.missingIds.length > 0
        ? assembled.missingIds
        : [`count=${assembled.count} have=${assembled.expectedIds.length}`];
    throw new OfficialCardsError(
      `official catalog incomplete: expected ${assembled.count} ids, have ${assembled.expectedIds.length} sort ids, missing ${missing.join(", ")}`,
      assembled.missingIds,
    );
  }

  const nowFn = client.now ?? (() => new Date());
  const fetchedAt = nowFn().toISOString();
  const meta = buildOfficialMetaFile(assembled, {
    fetched_at: fetchedAt,
    count: assembled.count,
    lang,
    source: options.source ?? OFFICIAL_ORIGIN,
  });

  const writtenIds = officialMetaCardIds(meta);
  if (writtenIds.length !== assembled.count) {
    const have = new Set(writtenIds);
    const missing = assembled.expectedIds.filter((id) => !have.has(id));
    throw new OfficialCardsError(
      `official catalog incomplete: expected ${assembled.count} records, have ${writtenIds.length}, missing ${missing.join(", ")}`,
      missing,
    );
  }

  return { pages, fallbackPages, assembled, meta };
}

export function loadOfficialInput(raw: unknown): OfficialCardListResponse[] {
  if (Array.isArray(raw)) {
    return raw as OfficialCardListResponse[];
  }
  if (isRecord(raw) && Array.isArray(raw.pages)) {
    return raw.pages as OfficialCardListResponse[];
  }
  if (isRecord(raw) && raw.data) {
    return [raw as OfficialCardListResponse];
  }
  throw new OfficialCardsError(
    "official --input must be a cardList response, an array of responses, or { pages: [...] }",
  );
}

/**
 * Offline assemble from a saved cardList dump. Does not hit the network;
 * a short catalog (count says N, only N-1 records) exits as OfficialCardsError
 * naming the missing id — used by `--input` and the corrupted-dump gate.
 */
export function collectOfficialFromInput(
  raw: unknown,
  options: {
    lang?: string;
    source?: string;
    now?: () => Date;
  } = {},
): CollectedOfficial {
  const pages = loadOfficialInput(raw);
  const assembled = assembleOfficialCatalog(pages);
  const haveRecords = assembled.expectedIds.filter((id) =>
    assembled.records.has(id),
  );
  if (
    assembled.expectedIds.length !== assembled.count ||
    assembled.missingIds.length ||
    haveRecords.length !== assembled.count
  ) {
    const named =
      assembled.missingIds.length > 0
        ? assembled.missingIds
        : assembled.expectedIds.filter((id) => !assembled.records.has(id));
    throw new OfficialCardsError(
      `official catalog incomplete: expected ${assembled.count} ids, have ${haveRecords.length} records, missing ${named.join(", ") || "(unknown)"}`,
      named,
    );
  }
  const nowFn = options.now ?? (() => new Date());
  const fetchedAt = nowFn().toISOString();
  const meta = buildOfficialMetaFile(assembled, {
    fetched_at: fetchedAt,
    count: assembled.count,
    lang: options.lang ?? "en",
    source: options.source ?? "input",
  });
  return { pages, fallbackPages: [], assembled, meta };
}

/** JSON.stringify sorts integer-looking keys first; keep `_meta` at the top. */
export async function writeOfficialMetaFile(
  outPath: string,
  meta: OfficialMetaFile,
): Promise<void> {
  const cards: Record<string, OfficialCardRecord> = {};
  for (const id of officialMetaCardIds(meta)) {
    const rec = getOfficialCard(meta, id);
    if (rec) cards[id] = rec;
  }
  const cardsJson = JSON.stringify(cards, null, 2);
  const headerJson = JSON.stringify(meta._meta, null, 2);
  const raw = `{\n  "_meta": ${headerJson.replace(/\n/g, "\n  ")},\n${cardsJson.slice(1)}`;
  const formatted = await prettier.format(raw, {
    ...(await prettier.resolveConfig(outPath)),
    parser: "json",
  });
  fs.writeFileSync(outPath, formatted);
}

export async function writeOfficialOutputs(options: {
  meta: OfficialMetaFile;
  outPath: string;
  mdPath?: string;
  rawPath?: string;
  pages?: OfficialCardListResponse[];
}): Promise<void> {
  await writeOfficialMetaFile(options.outPath, options.meta);
  if (options.mdPath) {
    await writeFormattedMarkdown(
      options.mdPath,
      renderOfficialQaMarkdown(options.meta),
    );
  }
  if (options.rawPath && options.pages) {
    const dir = path.dirname(options.rawPath);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
    await writeFormattedJson(options.rawPath, options.pages);
  }
}
