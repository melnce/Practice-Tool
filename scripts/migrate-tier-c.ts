#!/usr/bin/env tsx
/**
 * One-shot migration for card-JSON drift tier C (C1–C14).
 * Edits only targeted keys on named card ids; writes set files via Prettier.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "./mergeSets.js";
import { writeFormattedJson } from "./lib/formatJson.js";
import { TOKEN_FILE } from "./lib/loadCards.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

type Card = Record<string, unknown> & { id: string };

const C1_IDS = new Set([
  "10031320",
  "10061210",
  "10062210",
  "10121130",
  "10122310",
  "10124130",
  "10131120",
  "10131130",
  "10132120",
  "10133110",
  "10133320",
  "10143210",
  "10144130",
  "10151110",
  "10161310",
  "10163130",
  "10163210",
  "10174120",
  "10271110",
  "10353110",
  "10362220",
  "10371120",
  "10373310",
  "10374120",
  "10421120",
  "10421130",
  "10424110",
  "10432120",
  "10451120",
  "10661110",
  "10662110",
  "10663110",
  "10734110",
  "10952110",
  "10962120",
]);

const C2_IDS = new Set([
  "10001120",
  "10702110",
  "10704120",
  "10711310",
  "10713110",
  "10722120",
  "10733110",
  "10742310",
  "10751310",
  "10761110",
]);

const C3_LEADER_PLAYER = new Set([
  "10111130",
  "10174110",
  "10314110",
  "10331110",
  "10362110",
  "10362210",
  "10423310",
  "10431310",
  "10451310",
]);
const C3_ALLY_LEADER = new Set(["10342110"]);

const C4_IDS = new Set([
  "10144110",
  "10163110",
  "10361310",
  "10554120",
  "10562120",
  "10643310",
  "10664110",
  "10703110",
  "10723310",
  "10732310",
  "10733110",
  "10734120",
  "10743310",
  "10744110",
  "10762210",
]);

const C5_IDS = new Set([
  "10403110",
  "10413310",
  "10423110",
  "10423310",
  "10432310",
  "10434110",
  "10452130",
]);

const C6_ID = "10654110";
const C7_IDS = new Set(["10223110", "10333310"]);
const C8_ID = "10161110";
const C9_IDS = new Set(["10114130", "10364110"]);
const C10_IDS = new Set([
  "10164110",
  "10264110",
  "10322120",
  "10754110",
  "10813310",
  "10864110",
]);
const C11_IDS = new Set([
  "10142110",
  "10313310",
  "10352210",
  "10361110",
  "10441120",
  "10441310",
  "10452130",
  "10822310",
]);

const C12_IDS = new Set([
  "10111110",
  "10121120",
  "10123130",
  "10124120",
  "10142130",
  "10154110",
  "10164120",
  "10223120",
  "10253110",
  "10253120",
  "10264110",
  "10301110",
  "10322120",
  "10371110",
  "10434110",
  "10452130",
  "10462120",
  "10501110",
  "10523110",
  "10534120",
  "10553110",
  "10564110",
  "10624110",
  "10631120",
  "10723110",
  "10724120",
  "10741120",
  "10814110",
  "10871120",
  "10902110",
  "10913110",
  "10931110",
  "10942120",
]);

const POOL_PREFIXES = [
  "enemy:",
  "ally:",
  "all:",
  "random:",
  "other:",
  "selected:",
];

function isPoolTarget(t: unknown): boolean {
  if (typeof t !== "string") return false;
  return POOL_PREFIXES.some((p) => t.startsWith(p));
}

function walk(
  node: unknown,
  visit: (
    obj: Record<string, unknown>,
    parent?: Record<string, unknown>,
  ) => void,
  parent?: Record<string, unknown>,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj, parent);
  for (const v of Object.values(obj)) walk(v, visit, obj);
}

function isOnlyKey(obj: Record<string, unknown>, key: string): boolean {
  const keys = Object.keys(obj);
  return keys.length === 1 && keys[0] === key;
}

function migrateCard(card: Card): boolean {
  let changed = false;
  const id = card.id;

  walk(card, (obj, parent) => {
    // C1 — named summon missing count on listed cards
    if (
      C1_IDS.has(id) &&
      obj.op === "summon" &&
      obj.source === "named" &&
      obj.count === undefined
    ) {
      obj.count = 1;
      changed = true;
    }

    // C2 — drop redundant player:self on draw
    if (C2_IDS.has(id) && obj.op === "draw" && obj.player === "self") {
      delete obj.player;
      changed = true;
    }

    // C3 — restore leader missing player
    if (
      C3_LEADER_PLAYER.has(id) &&
      obj.op === "restore" &&
      obj.target === "leader" &&
      obj.player === undefined
    ) {
      obj.player = "self";
      changed = true;
    }
    if (
      C3_ALLY_LEADER.has(id) &&
      obj.op === "restore" &&
      obj.target === "ally:leader"
    ) {
      obj.target = "leader";
      obj.player = "self";
      changed = true;
    }

    // C4 — drop distribution:all on pool damage
    if (
      C4_IDS.has(id) &&
      obj.op === "damage" &&
      obj.distribution === "all" &&
      isPoolTarget(obj.target)
    ) {
      delete obj.distribution;
      changed = true;
    }

    // C6
    if (
      id === C6_ID &&
      obj.op === "attacks_per_turn" &&
      obj.amount !== undefined &&
      obj.value === undefined
    ) {
      obj.value = obj.amount;
      delete obj.amount;
      changed = true;
    }

    // C7
    if (C7_IDS.has(id) && obj.op === "cost" && obj.action && !obj.mode) {
      obj.mode = obj.action;
      delete obj.action;
      changed = true;
    }

    // C8
    if (
      id === C8_ID &&
      obj.op === "cost" &&
      (obj as any).minCost !== undefined &&
      obj.min_cost === undefined
    ) {
      obj.min_cost = (obj as any).minCost;
      delete (obj as any).minCost;
      changed = true;
    }

    // C9
    if (
      C9_IDS.has(id) &&
      obj.op === "repeat_effect" &&
      (obj as any).effect &&
      !(obj as any).effects
    ) {
      (obj as any).effects = [(obj as any).effect];
      delete (obj as any).effect;
      changed = true;
    }

    // C10
    if (
      C10_IDS.has(id) &&
      obj.op === "summon" &&
      (obj as any).filters &&
      !obj.filter
    ) {
      obj.filter = (obj as any).filters;
      delete (obj as any).filters;
      changed = true;
    }

    // C11 — stat random selection canonical form
    if (C11_IDS.has(id) && obj.op === "stat") {
      if (obj.random === true) {
        delete obj.random;
        if (obj.count === 1 && obj.select === undefined) obj.select = 1;
        obj.select_mode = "random";
        delete obj.count;
        changed = true;
      } else if (obj.pick === "random") {
        delete obj.pick;
        obj.select_mode = "random";
        changed = true;
      } else if (obj.distribution === "random") {
        delete obj.distribution;
        obj.select_mode = "random";
        changed = true;
      }
    }

    // C12 — remove inert self-exclusion keys (only on listed cards)
    if (C12_IDS.has(id)) {
      const parentIsTrigger =
        parent != null &&
        typeof parent.event === "string" &&
        Array.isArray(parent.effects);

      if (
        obj.condition &&
        typeof obj.condition === "object" &&
        !Array.isArray(obj.condition) &&
        (obj.condition as Record<string, unknown>).not_self === true &&
        isOnlyKey(obj.condition as Record<string, unknown>, "not_self") &&
        !parentIsTrigger
      ) {
        delete obj.condition;
        changed = true;
      }
      if (
        obj.filter &&
        typeof obj.filter === "object" &&
        !Array.isArray(obj.filter) &&
        (obj.filter as Record<string, unknown>).not_self === true &&
        isOnlyKey(obj.filter as Record<string, unknown>, "not_self")
      ) {
        delete obj.filter;
        changed = true;
      }
      if (
        obj.op === "stat" &&
        obj.exclude_self === true &&
        obj.attack_source !== "count_allies" &&
        obj.defense_source !== "count_allies"
      ) {
        delete obj.exclude_self;
        changed = true;
      }
      // Remove not_self from compound condition/filter on effect ops (not trigger conditions)
      if (
        !parentIsTrigger &&
        obj.condition &&
        typeof obj.condition === "object" &&
        !Array.isArray(obj.condition)
      ) {
        const c = obj.condition as Record<string, unknown>;
        if (c.not_self === true && Object.keys(c).length > 1) {
          delete c.not_self;
          changed = true;
        }
      }
      if (
        obj.filter &&
        typeof obj.filter === "object" &&
        !Array.isArray(obj.filter)
      ) {
        const f = obj.filter as Record<string, unknown>;
        if (f.not_self === true && Object.keys(f).length > 1) {
          delete f.not_self;
          changed = true;
        }
      }
    }
  });

  // C5 fix: mode options are nested — re-walk with parent context
  if (C5_IDS.has(id)) {
    walk(card, (obj, parent) => {
      if (obj.op !== "mode" || !Array.isArray(obj.options)) return;
      for (const opt of obj.options) {
        if (!opt || typeof opt !== "object") continue;
        const o = opt as Record<string, unknown>;
        if (o.name && !o.label) {
          o.label = o.name;
          delete o.name;
          changed = true;
        }
      }
    });
  }

  // C13 — enter trigger migration
  if (id === "10011210") {
    const kws = card.keywords;
    if (Array.isArray(kws)) {
      const filtered = kws.filter(
        (k) =>
          !(
            k &&
            typeof k === "object" &&
            (k as Record<string, unknown>).name === "PixieEnter"
          ),
      );
      if (filtered.length !== kws.length) {
        card.keywords = filtered;
        const triggers = Array.isArray(card.triggers) ? [...card.triggers] : [];
        triggers.push({
          event: "ally_follower_enter",
          source: "board",
          condition: { tribe: "Pixie" },
          effects: [
            {
              op: "damage",
              target: "enemy:follower",
              amount: 1,
              distribution: "random_hits",
              count: 1,
            },
          ],
        });
        card.triggers = triggers;
        changed = true;
      }
    }
  }
  if (id === "10022210") {
    const kws = card.keywords;
    if (Array.isArray(kws)) {
      const filtered = kws.filter(
        (k) =>
          !(
            k &&
            typeof k === "object" &&
            (k as Record<string, unknown>).name === "AllyEnter"
          ),
      );
      if (filtered.length !== kws.length) {
        card.keywords = filtered;
        const triggers = Array.isArray(card.triggers) ? [...card.triggers] : [];
        triggers.push({
          event: "ally_follower_enter",
          source: "board",
          effects: [
            {
              op: "stat",
              action: "give",
              target: "entering_follower",
              attack: 1,
              defense: 1,
            },
          ],
        });
        card.triggers = triggers;
        changed = true;
      }
    }
  }

  // C14 — skipped: removing redundant Strike string moves combat fingerprint (hasStrike marker)

  return changed;
}

function migrateTokens(cards: Card[]): boolean {
  let changed = false;
  for (const card of cards) {
    walk(card, (obj, parent) => {
      if (
        obj.op === "summon" &&
        obj.source === "named" &&
        obj.count === undefined
      ) {
        obj.count = 1;
        changed = true;
      }
      if (
        obj.op === "restore" &&
        obj.target === "leader" &&
        obj.player === undefined
      ) {
        obj.player = "self";
        changed = true;
      }
      if (obj.op === "stat") {
        if (obj.random === true) {
          delete obj.random;
          if (obj.count === 1 && obj.select === undefined) obj.select = 1;
          obj.select_mode = "random";
          delete obj.count;
          changed = true;
        } else if (obj.pick === "random") {
          delete obj.pick;
          obj.select_mode = "random";
          changed = true;
        }
      }
    });
  }
  return changed;
}

async function main(): Promise<void> {
  const setFiles = fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let totalCards = 0;
  let changedFiles = 0;

  for (const file of setFiles) {
    const filePath = path.join(SETS_DIR, file);
    const cards: Card[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    let fileChanged = false;
    for (const card of cards) {
      totalCards++;
      if (migrateCard(card)) fileChanged = true;
    }
    if (fileChanged) {
      await writeFormattedJson(filePath, cards);
      changedFiles++;
      console.log(`updated ${file}`);
    }
  }

  if (fs.existsSync(TOKEN_FILE)) {
    const tokens: Card[] = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    if (migrateTokens(tokens)) {
      await writeFormattedJson(TOKEN_FILE, tokens);
      changedFiles++;
      console.log("updated token_details.json");
    }
  }

  console.log(`scanned ${totalCards} set cards; ${changedFiles} files written`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
