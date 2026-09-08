#!/usr/bin/env tsx
/**
 * Canonical-form gate for card-data drift families.
 *
 * Migrated families hard-fail via npm run check:
 *   --gate=turn-scope|select-count|chosen-target --fail
 * Other families remain WARN-only until their own migration PRs land.
 *
 * SHAPE-ONLY: inspects JSON structure. Must never treat keyword-duration
 * phrasing ("until the end of your opponent's turn") as turn-trigger scope —
 * that false positive is documented for Agent of the Testaments (10962110)
 * in claude/card-data-drift-2026-08-31.md.
 *
 *   npm run check:canonical-form
 *   npx tsx scripts/check-canonical-form.ts --gate=turn-scope --fail
 *   npx tsx scripts/check-canonical-form.ts --gate=select-count --fail
 *   npx tsx scripts/check-canonical-form.ts --gate=chosen-target --fail
 *   npx tsx scripts/check-canonical-form.ts --gate=evolve-target --fail
 *   npx tsx scripts/check-canonical-form.ts --gate=enhance-instead --fail
 *   npx tsx scripts/check-canonical-form.ts --gate=op-key-shape --fail
 *
 * Optional `--fail` promotes the selected family's warnings to exit 1.
 */

import path from "path";
import { fileURLToPath } from "url";
import { loadCardsForGates, type CardJson } from "./lib/loadCards.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

type Family =
  | "turn-scope"
  | "select-count"
  | "chosen-target"
  | "evolve-target"
  | "enhance-instead"
  | "op-key-shape";

type Warning = {
  family: Family;
  id: string;
  name: string;
  sourceFile: string;
  found: string;
  canonical: string;
  note?: string;
};

const FLATTENABLE_OPS = new Set([
  "damage",
  "destroy",
  "banish",
  "stat",
  "keyword",
  "transform",
  "evolve",
  "return",
  "cost",
  "heal",
  "draw",
  "spellboost",
  "add_to_hand",
  "summon",
  "reanimate",
  "restore",
]);

function compact(obj: unknown): string {
  return JSON.stringify(obj);
}

function walk(
  node: unknown,
  visit: (obj: Record<string, unknown>, path: string) => void,
  path = "$",
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, visit, `${path}[${i}]`));
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj, path);
  for (const [key, value] of Object.entries(obj)) {
    walk(value, visit, `${path}.${key}`);
  }
}

function isTurnTrigger(obj: Record<string, unknown>): boolean {
  return (
    obj.type === "end_of_turn_own" ||
    obj.type === "start_of_turn_own" ||
    obj.event === "end_of_turn" ||
    obj.event === "start_of_turn"
  );
}

const DURING_YOUR_TURN_WHENEVER = /During your turn,? whenever/i;

function checkTurnScope(card: CardJson): Warning[] {
  const out: Warning[] = [];
  walk(card, (obj) => {
    if (!isTurnTrigger(obj)) return;

    // Retire type:*_own — type currently carries the event (event is undefined).
    if (obj.type === "end_of_turn_own" || obj.type === "start_of_turn_own") {
      const event =
        obj.type === "end_of_turn_own" ? "end_of_turn" : "start_of_turn";
      const { type: _t, ...rest } = obj;
      const canonical = {
        ...rest,
        event,
        condition: {
          ...((typeof obj.condition === "object" &&
          obj.condition &&
          !Array.isArray(obj.condition)
            ? obj.condition
            : {}) as object),
          whose_turn: "owner",
        },
      };
      out.push({
        family: "turn-scope",
        id: card.id,
        name: card.name,
        found: compact({
          type: obj.type,
          event: obj.event ?? null,
          condition: obj.condition ?? null,
        }),
        canonical: compact({
          event: canonical.event,
          condition: (canonical as any).condition,
        }),
        note: "type is the event carrier today (event: undefined) — migrate as add-event + add-condition.whose_turn + remove-type, not a rename",
      });
      return;
    }

    // Retire condition.own_turn in favour of whose_turn.
    const cond = obj.condition;
    if (
      cond &&
      typeof cond === "object" &&
      !Array.isArray(cond) &&
      (cond as any).own_turn
    ) {
      const nextCond = { ...(cond as Record<string, unknown>) };
      delete nextCond.own_turn;
      nextCond.whose_turn = "owner";
      out.push({
        family: "turn-scope",
        id: card.id,
        name: card.name,
        found: compact({
          event: obj.event,
          condition: { own_turn: true },
        }),
        canonical: compact({
          event: obj.event,
          condition: { whose_turn: "owner" },
        }),
        note: "own_turn is a synonym of whose_turn:owner — retire the boolean spelling",
      });
    }
  });

  // "During your turn, whenever …" — every top-level trigger must scope to owner.
  if (
    card.description &&
    DURING_YOUR_TURN_WHENEVER.test(card.description) &&
    Array.isArray(card.triggers)
  ) {
    for (let i = 0; i < card.triggers.length; i++) {
      const trig = card.triggers[i];
      if (!trig || typeof trig !== "object") continue;
      const t = trig as Record<string, unknown>;
      const cond =
        t.condition &&
        typeof t.condition === "object" &&
        !Array.isArray(t.condition)
          ? (t.condition as Record<string, unknown>)
          : {};
      if (cond.whose_turn !== "owner") {
        const nextCond = { ...cond, whose_turn: "owner" };
        out.push({
          family: "turn-scope",
          id: card.id,
          name: card.name,
          found: compact({
            trigger_index: i,
            event: t.event ?? t.type ?? null,
            condition: t.condition ?? null,
          }),
          canonical: compact({
            trigger_index: i,
            event: t.event ?? t.type ?? null,
            condition: nextCond,
          }),
          note: 'printed "During your turn, whenever …" requires condition.whose_turn:"owner" on every trigger',
        });
      }
    }
  }

  return out;
}

function checkSelectCount(card: CardJson): Warning[] {
  const out: Warning[] = [];
  walk(card, (obj) => {
    if (obj.select_count == null) return;
    // If both select and select_count somehow appear, still flag select_count.
    const canonical = { ...obj, select: obj.select ?? obj.select_count };
    delete (canonical as any).select_count;
    out.push({
      family: "select-count",
      id: card.id,
      name: card.name,
      found: compact({
        op: obj.op ?? null,
        select_count: obj.select_count,
        select: obj.select ?? null,
      }),
      canonical: compact({
        op: obj.op ?? null,
        select: obj.select ?? obj.select_count,
      }),
      note: "`select` is canonical; `select_count` is accepted only as a legacy fallback",
    });
  });
  return out;
}

const EVOLVE_TARGETS = new Set([
  "self",
  "played_card",
  "selected",
  "selected:follower",
  "last_summoned",
  "entering_follower",
  "all_allies",
  "ally:follower",
]);

function checkEvolveTarget(card: CardJson): Warning[] {
  const out: Warning[] = [];
  walk(card, (obj, path) => {
    const w = checkEvolveTargetAt(card, path, obj);
    if (w) out.push(w);
  });
  return out;
}

function checkEvolveTargetAt(
  card: CardJson,
  path: string,
  obj: Record<string, unknown>,
): Warning | null {
  if (obj.op !== "evolve") return null;
  const target = obj.target;
  if (target == null) return null;
  const targetStr = String(target);
  if (EVOLVE_TARGETS.has(targetStr)) return null;
  return {
    family: "evolve-target",
    id: card.id,
    name: card.name,
    found: compact({ path, target: targetStr }),
    canonical: compact({
      path,
      target: targetStr.startsWith("ally:last_summoned")
        ? "last_summoned"
        : "(allowlisted evolve target)",
    }),
    note: `evolve target must be one of: ${[...EVOLVE_TARGETS].join(", ")}`,
  };
}

function checkChosenTarget(card: CardJson): Warning[] {
  // Key Spirit: nested select → spellboost target:"selected". Flattening would
  // rewrite the child's target to the select's "ally:hand", but ally:hand means
  // whole-hand to the spellboost handler — not behaviour-equivalent to boosting
  // the one chosen card 4 times. See Family 3 deferred note in
  // claude/card-data-drift-2026-08-31.md.
  if (card.id === "10931120") return [];

  const out: Warning[] = [];
  walk(card, (obj) => {
    if (obj.op !== "select") return;
    if (!Array.isArray(obj.effects)) return;
    if (obj.effects.length !== 1) return;
    const child = obj.effects[0];
    if (!child || typeof child !== "object") return;
    const childObj = child as Record<string, unknown>;
    const childOp = String(childObj.op ?? "");
    // gate/mode wrappers share the selection across branches — keep nested.
    if (childOp === "gate" || childOp === "mode") return;
    if (!FLATTENABLE_OPS.has(childOp)) return;

    // Only a violation when the child actually consumes the selection.
    // (e.g. Cassius selects a hand card then damages an enemy — not flattenable.)
    const childTarget = childObj.target;
    const usesSelected =
      typeof childTarget === "string" &&
      (childTarget === "selected" || childTarget.startsWith("selected:"));
    if (!usesSelected) return;

    const flat: Record<string, unknown> = {
      op: childOp,
      target: obj.target ?? null,
      select: obj.select ?? obj.select_count ?? 1,
    };
    // Preserve other child fields in the canonical hint (amount, action, …).
    for (const [k, v] of Object.entries(childObj)) {
      if (k === "op" || k === "target") continue;
      flat[k] = v;
    }

    out.push({
      family: "chosen-target",
      id: card.id,
      name: card.name,
      found: compact({
        op: "select",
        target: obj.target ?? null,
        select: obj.select ?? obj.select_count ?? null,
        effects: [{ op: childOp, target: childObj.target ?? null }],
      }),
      canonical: compact({
        op: childOp,
        target: flat.target ?? null,
        select: flat.select,
      }),
      note: "single consumer of the selection — use flat op+select; keep nested op:select only when 2+ effects share one selection",
    });
  });
  return out;
}

function checkSpellboostCostKeywordShape(card: CardJson): Warning[] {
  const out: Warning[] = [];
  for (let i = 0; i < (card.keywords ?? []).length; i++) {
    const k = card.keywords![i];
    if (!k || typeof k !== "object") continue;
    const kw = k as {
      name?: string;
      effects?: unknown[];
      reduceCostBy?: number;
      minCost?: number;
    };
    if (String(kw.name ?? "").toLowerCase() !== "spellboost") continue;
    const effects = Array.isArray(kw.effects) ? kw.effects : [];
    for (let j = 0; j < effects.length; j++) {
      const eff = effects[j];
      if (!eff || typeof eff !== "object") continue;
      const e = eff as Record<string, unknown>;
      if (
        e.op === "cost" &&
        String(e.target ?? "").toLowerCase() === "self" &&
        e.mode === "reduce"
      ) {
        out.push({
          family: "op-key-shape",
          id: card.id,
          name: card.name,
          found: compact({
            path: `$.keywords[${i}].effects[${j}]`,
            keyword: kw,
          }),
          canonical: compact({
            path: `$.keywords[${i}]`,
            name: "Spellboost",
            reduceCostBy: e.amount ?? 1,
            minCost: 0,
          }),
          note: 'Spellboost cost reduction must use reduceCostBy/minCost on the keyword, not op:"cost" in effects',
        });
      }
    }
  }
  return out;
}

function checkOpKeyShape(card: CardJson): Warning[] {
  const out: Warning[] = checkSpellboostCostKeywordShape(card);
  walk(card, (obj, path) => {
    const op = String(obj.op ?? "");

    if (op === "summon" && obj.source === "named" && obj.count === undefined) {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({ path, op, source: "named", count: null }),
        canonical: compact({ path, op, source: "named", count: 1 }),
        note: 'op:"summon" with source:"named" must carry count',
      });
    }

    if (op === "draw" && obj.player === "self") {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({ path, op, player: "self" }),
        canonical: compact({ path, op }),
        note: 'op:"draw" must not carry player:"self"',
      });
    }

    if (
      op === "restore" &&
      obj.target === "leader" &&
      obj.player === undefined
    ) {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({ path, op, target: "leader", player: null }),
        canonical: compact({ path, op, target: "leader", player: "self" }),
        note: 'op:"restore" with target:"leader" must carry player:"self"',
      });
    }

    if (op === "restore" && obj.target === "ally:leader") {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({ path, op, target: "ally:leader" }),
        canonical: compact({ path, op, target: "leader", player: "self" }),
        note: 'op:"restore" must use target:"leader" with player:"self", not ally:leader',
      });
    }

    if (op === "damage" && obj.distribution === "all") {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({
          path,
          op,
          distribution: "all",
          target: obj.target ?? null,
        }),
        canonical: compact({ path, op, target: obj.target ?? null }),
        note: 'op:"damage" must not carry distribution:"all"',
      });
    }

    if (op === "cost") {
      if ((obj as any).action && !(obj as any).mode) {
        out.push({
          family: "op-key-shape",
          id: card.id,
          name: card.name,
          found: compact({ path, op, action: (obj as any).action }),
          canonical: compact({ path, op, mode: (obj as any).action }),
          note: 'op:"cost" must use mode, not action',
        });
      }
      if ((obj as any).minCost !== undefined) {
        out.push({
          family: "op-key-shape",
          id: card.id,
          name: card.name,
          found: compact({ path, op, minCost: (obj as any).minCost }),
          canonical: compact({ path, op, min_cost: (obj as any).minCost }),
          note: 'op:"cost" must use min_cost, not minCost',
        });
      }
    }

    if (
      op === "attacks_per_turn" &&
      (obj as any).amount !== undefined &&
      obj.value === undefined
    ) {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({ path, op, amount: (obj as any).amount }),
        canonical: compact({ path, op, value: (obj as any).amount }),
        note: 'op:"attacks_per_turn" must use value, not amount',
      });
    }

    if (
      op === "repeat_effect" &&
      (obj as any).effect &&
      !(obj as any).effects
    ) {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({ path, op, effect: "(object)" }),
        canonical: compact({ path, op, effects: ["(array)"] }),
        note: 'op:"repeat_effect" must use effects, not effect',
      });
    }

    if (op === "summon" && (obj as any).filters) {
      out.push({
        family: "op-key-shape",
        id: card.id,
        name: card.name,
        found: compact({ path, op, filters: (obj as any).filters }),
        canonical: compact({ path, op, filter: (obj as any).filters }),
        note: 'op:"summon" must use filter, not filters',
      });
    }

    if (op === "stat") {
      const badRandom =
        obj.random === true ||
        String((obj as any).pick || "").toLowerCase() === "random" ||
        obj.distribution === "random";
      if (badRandom) {
        out.push({
          family: "op-key-shape",
          id: card.id,
          name: card.name,
          found: compact({
            path,
            op,
            random: obj.random ?? null,
            pick: (obj as any).pick ?? null,
            distribution: obj.distribution ?? null,
          }),
          canonical: compact({
            path,
            op,
            select_mode: "random",
            select: obj.select ?? 1,
          }),
          note: 'random selection on op:"stat" must use select_mode:"random"',
        });
      }
    }

    if (op === "mode" && Array.isArray(obj.options)) {
      for (let i = 0; i < obj.options.length; i++) {
        const opt = obj.options[i];
        if (!opt || typeof opt !== "object") continue;
        const o = opt as Record<string, unknown>;
        if (o.name && !o.label) {
          out.push({
            family: "op-key-shape",
            id: card.id,
            name: card.name,
            found: compact({ path: `${path}.options[${i}]`, name: o.name }),
            canonical: compact({
              path: `${path}.options[${i}]`,
              label: o.name,
            }),
            note: 'op:"mode" options must use label, not name',
          });
        }
      }
    }
  });
  return out;
}

function checkEnhanceInstead(card: CardJson): Warning[] {
  const desc = String(card.description ?? "");
  if (!/Enhance \(\d+\):[^\n]*\binstead\b/i.test(desc)) return [];
  if (card.enhance_replaces_base === true) return [];
  return [
    {
      family: "enhance-instead",
      id: card.id,
      name: card.name,
      found: compact({
        enhance_replaces_base: card.enhance_replaces_base ?? null,
        description_line: desc
          .split(/\r?\n/)
          .find((line) => /Enhance \(\d+\):[^\n]*\binstead\b/i.test(line)),
      }),
      canonical: compact({ enhance_replaces_base: true }),
      note: 'printed "Enhance (N): … instead" requires enhance_replaces_base:true',
    },
  ];
}

function printFamily(family: Family, warnings: Warning[]): void {
  const list = warnings.filter((w) => w.family === family);
  console.log(`\n======= ${family} (${list.length}) =======`);
  if (list.length === 0) {
    console.log("(none)");
    return;
  }
  for (const w of list) {
    console.log(`\n${w.id}\t${w.name}\t(${w.sourceFile})`);
    console.log(`  found:      ${w.found}`);
    console.log(`  canonical:  ${w.canonical}`);
    if (w.note) console.log(`  note:       ${w.note}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const failMode = args.includes("--fail");
  const gateArg = args.find((a) => a.startsWith("--gate="));
  const gateFilter = gateArg
    ? (gateArg.slice("--gate=".length) as Family | "all")
    : "all";

  const loaded = loadCardsForGates();
  const warnings: Warning[] = [];

  for (const { card, sourceFile } of loaded) {
    const tag = (w: Omit<Warning, "sourceFile">): Warning => ({
      ...w,
      sourceFile,
    });
    if (gateFilter === "all" || gateFilter === "turn-scope") {
      warnings.push(...checkTurnScope(card).map(tag));
    }
    if (gateFilter === "all" || gateFilter === "select-count") {
      warnings.push(...checkSelectCount(card).map(tag));
    }
    if (gateFilter === "all" || gateFilter === "chosen-target") {
      warnings.push(...checkChosenTarget(card).map(tag));
    }
    if (gateFilter === "all" || gateFilter === "evolve-target") {
      warnings.push(...checkEvolveTarget(card).map(tag));
    }
    if (gateFilter === "all" || gateFilter === "enhance-instead") {
      warnings.push(...checkEnhanceInstead(card).map(tag));
    }
    if (gateFilter === "all" || gateFilter === "op-key-shape") {
      warnings.push(...checkOpKeyShape(card).map(tag));
    }
  }

  // Dedupe identical warnings (same card can be walked via overlapping paths).
  const seen = new Set<string>();
  const unique = warnings.filter((w) => {
    const key = `${w.family}|${w.id}|${w.found}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const migrated =
    gateFilter === "turn-scope" ||
    gateFilter === "select-count" ||
    gateFilter === "chosen-target" ||
    gateFilter === "evolve-target" ||
    gateFilter === "enhance-instead" ||
    gateFilter === "op-key-shape";
  console.log(
    migrated
      ? `Canonical-form gate — ${gateFilter} (error mode when --fail)`
      : "Canonical-form gate — WARN mode for unmigrated families",
  );
  console.log(
    `scanned ${loaded.length} cards from cards/sets/ + cards/token_details.json`,
  );

  printFamily("turn-scope", unique);
  printFamily("select-count", unique);
  printFamily("chosen-target", unique);
  printFamily("evolve-target", unique);
  printFamily("enhance-instead", unique);
  printFamily("op-key-shape", unique);

  console.log(
    `\nTotal warnings: ${unique.length}` +
      (failMode ? " (--fail: will exit 1 if any)" : " (exit 0)"),
  );

  if (failMode && unique.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
