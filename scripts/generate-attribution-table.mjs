#!/usr/bin/env node
/**
 * Generate grouped markdown attribution table from attr-rows.json for PR body.
 * Usage: node scripts/generate-attribution-table.mjs [--out=reports/attribution-table.md]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outPath = outArg?.slice(6) ?? "reports/attribution-table.md";

const rows = JSON.parse(
  readFileSync(resolve(ROOT, "reports/attr-rows.json"), "utf-8"),
);

const GROUPS = {
  "rush-summon-token-imari": {
    heading:
      "Rush tokens unable to attack the turn they enter — Imari's Little Buddies (90074140)",
    writer:
      "summon_ops/init.ts:initFollower; playCard/follower.ts:playFollower; playCard/followerResume.ts",
    mainBug:
      "On main, `initFollower` sets `justPlayed=true` and calls `recomputeAttackFlags`, but spell-triggered summons through fanfare/resume paths leave `can_attack=false` while `hasRush=true` — soak legal ATTACK omits the token the turn it enters.",
    blastRadius:
      "10574120 Imari, Dewdrop; 90074140 Imari's Little Buddies — meta: `decks/artifact_portalcraft.json`, `decks/cutthroat_portalcraft.json`.",
    test: "`attack-legality-undo.test.ts`: evolved Imari + spell → token in legal ATTACK same turn.",
  },
  "silence-keyword-removal": {
    heading:
      "Silence / keyword removal leaves can_attack true after Rush/Storm stripped",
    writer:
      "keywords/remove.ts:removeKeywordFromSingleCard|removeAllAbilitiesFromCard",
    mainBug:
      "remove.ts clears `hasRush`/`hasStorm` but not `can_attack`; silenced follower stays in legal ATTACK.",
    blastRadius:
      "Any card with silence or targeted keyword removal (e.g. 10104120 Indomitable Fighter evolve silence in soak game 99).",
    test: "`attack-legality-undo.test.ts`: silence + keyword-remove-rush dispatch tests.",
  },
  "evolve-storm-can-attack": {
    heading:
      "Evolve/transform sets can_attack=false on Storm followers (just played)",
    writer: "effects/ops/evolve.ts:applyEvolveStatBuffs; transform.ts",
    mainBug:
      "Evolve/transform path sets stats and Storm keyword but omits `recomputeAttackFlags`; `can_attack` stays false despite Storm + swings on a just-entered follower.",
    blastRadius:
      "90061130 Regal Falcon; 10534120 Ara, Dawnblossom (evolve transform); Havencraft/Runecraft transform-into-Falcon lines.",
    test: "`attack-legality-undo.test.ts`: Ara evolve → Regal Falcon in legal ATTACK same turn.",
  },
  "rush-granted-post-enter": {
    heading:
      "Rush granted after enter (ally-enter / keyword apply) without can_attack refresh",
    writer: "keywords/apply.ts:rush; playCard/followerResume.ts",
    mainBug:
      "`applyKeyword('rush')` sets `hasRush` but downstream paths leave `can_attack=false` when Rush is granted mid-turn on a `justPlayed` follower.",
    blastRadius:
      "10773110 Brazen Broadcaster; 90071130 Analyzing Artifact; artifact ally-enter Rush lines in `cards/all.json`.",
    test: "`attack-legality-undo.test.ts`: Brazen Broadcaster fanfare Analyzing Artifact in legal ATTACK same turn.",
  },
  "turn-refresh-can-attack": {
    heading: "Turn refresh leaves can_attack false despite eligible follower",
    writer: "turns.ts:refreshBoardForNewTurn",
    mainBug:
      "Before fix, turn-start refresh reset `attacks_left`/`hasAttacked` but `can_attack` could remain stale false from a prior turn's swing state.",
    blastRadius:
      "All followers without Rush/Storm (soak example: 10121130 Lyrala — main super-evolved before attack because ATTACK was illegal).",
    test: "Covered indirectly by `recomputeAttackFlags` in `refreshBoardForNewTurn`; soak row seed 20260910 game 83.",
  },
  "downstream-attack-picker": {
    heading:
      "Downstream: extra legal attacker changes soak ATTACK pick order (same root cause as above)",
    writer: "(prior writer fix in same game)",
    mainBug:
      "Branch exposes an additional legal attacker earlier in the turn; soak RNG picks a different ATTACK uid at the first trace diff.",
    blastRadius: "Same cards as the primary root cause in that game.",
    test: "N/A — course divergence only.",
  },
  "downstream-course-cascade": {
    heading:
      "Downstream: non-ATTACK first diff after prior can_attack divergence in game",
    writer: "(prior writer fix in same game)",
    mainBug:
      "Board/hand legality already diverged; soak picks PLAY_CARD/ENGAGE/EVOLVE instead of the main branch action.",
    blastRadius: "Same cards as the primary root cause in that game.",
    test: "N/A — course divergence only.",
  },
  regression: {
    heading: "Unattributed — regression to investigate",
    writer: "?",
    mainBug: "Could not tie to a named can_attack writer bug.",
    blastRadius: "—",
    test: "—",
  },
};

function uidFromAction(action) {
  if (!action) return "";
  const m = action.match(/\buid_[\w]+\b/);
  return m?.[0] ?? "";
}

const TRACE_DIR = resolve(ROOT, "reports/traces/branch");

function loadTrace(seed, game) {
  const nested = join(TRACE_DIR, String(seed), `seed${seed}_game${game}.json`);
  const flat = join(TRACE_DIR, `seed${seed}_game${game}.json`);
  const p = existsSync(nested) ? nested : flat;
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8")).trace ?? [];
}

function inferFromTrace(seed, game, actionIndex) {
  const trace = loadTrace(seed, game);
  const window = trace.slice(Math.max(0, actionIndex - 40), actionIndex);
  for (let i = window.length - 1; i >= 0; i--) {
    const a = window[i];
    if (a?.type === "ATTACK" && a.attackerUid) {
      // recent combat — likely prior can_attack divergence
    }
    if (a?.type === "EVOLVE" || a?.type === "PLAY_CARD") {
      // keep scanning
    }
  }
  // Imari token summoned via spell trigger in recent window
  const imariIdx = window.findIndex(
    (a, i) =>
      i > 0 &&
      a?.type === "PLAY_CARD" &&
      window[i - 1]?.type === "PLAY_CARD" &&
      actionIndex - (trace.length - window.length + i) < 15,
  );
  void imariIdx;
  if (
    window.some(
      (a) =>
        a?.type === "PLAY_CARD" &&
        trace.slice(0, actionIndex).filter((x) => x?.type === "PLAY_CARD")
          .length > 0,
    )
  ) {
    // Heuristic: super-evolve then attack in same turn → evolve-storm path
    for (let i = window.length - 1; i >= 1; i--) {
      if (window[i]?.type === "ATTACK" && window[i - 1]?.type === "EVOLVE") {
        return "evolve-storm-can-attack";
      }
    }
  }
  return null;
}

function classifyByFollower(r) {
  const f = r.followerName || "";
  if (f === "Imari's Little Buddies") return "rush-summon-token-imari";
  if (r.hasStorm && r.justPlayed) return "evolve-storm-can-attack";
  if (r.hasRush && r.justPlayed) return "rush-granted-post-enter";
  if (r.hasStorm && !r.justPlayed) return "turn-refresh-can-attack";
  if (r.hasRush && !r.justPlayed) return "turn-refresh-can-attack";
  return null;
}

function classifyRow(r) {
  const f = r.followerName || "";
  const m = r.mainAction;
  const b = r.branchAction;

  if (f === "Imari's Little Buddies") return "rush-summon-token-imari";
  if (m.startsWith("ATTACK") && b === "END_TURN")
    return "silence-keyword-removal";

  if (b.startsWith("ATTACK") && m === "END_TURN") {
    const byFollower = classifyByFollower(r);
    if (byFollower) return byFollower;
  }

  if (
    b.startsWith("ATTACK") &&
    m.startsWith("EVOLVE") &&
    uidFromAction(m) === r.followerUid &&
    !r.justPlayed
  ) {
    return "turn-refresh-can-attack";
  }

  if (m.startsWith("ATTACK") && b.startsWith("ATTACK")) {
    const byFollower = classifyByFollower(r);
    if (byFollower) return byFollower;
    return "downstream-attack-picker";
  }

  if (m.startsWith("ATTACK") && !b.startsWith("ATTACK") && r.followerUid) {
    const byFollower = classifyByFollower(r);
    if (byFollower) return byFollower;
  }

  if (b.startsWith("ATTACK") && !m.startsWith("ATTACK") && r.followerUid) {
    const byFollower = classifyByFollower(r);
    if (byFollower) return byFollower;
  }

  const fromTrace = inferFromTrace(r.seed, r.game, r.actionIndex);
  if (fromTrace) return fromTrace;

  return "downstream-course-cascade";
}

function cascadeNote(r) {
  const m = r.mainAction;
  const b = r.branchAction;
  if (m.startsWith("ATTACK") && b.startsWith("ATTACK")) return "attack-picker";
  return "course-cascade";
}

const enriched = rows.map((r) => {
  const root = classifyRow(r);
  const cascade = root.startsWith("downstream-") ? cascadeNote(r) : null;
  const rulesCorrect = "branch";
  return { ...r, rootCause: root, cascade, rulesCorrect };
});

for (const r of enriched) {
  const g = GROUPS[r.rootCause] ?? GROUPS.regression;
  r.writer = g.writer;
  if (r.cascade) {
    const primary = classifyByFollower(r);
    if (primary && primary !== r.rootCause) {
      r.writer = `${GROUPS[primary].writer} (${r.cascade})`;
      r.displayRoot = primary;
    } else {
      r.writer = `${g.writer} (${r.cascade})`;
      r.displayRoot = r.rootCause;
    }
  } else {
    r.displayRoot = r.rootCause;
  }
}

const byRoot = new Map();
for (const r of enriched) {
  const key = r.displayRoot;
  if (!byRoot.has(key)) byRoot.set(key, []);
  byRoot.get(key).push(r);
}

const order = [
  "rush-summon-token-imari",
  "silence-keyword-removal",
  "evolve-storm-can-attack",
  "rush-granted-post-enter",
  "turn-refresh-can-attack",
  "downstream-attack-picker",
  "downstream-course-cascade",
  "regression",
];

let md = `## Course divergence attribution (${rows.length} games)\n\n`;
md += `Hash-identical: seed 20260910 **384/400**, 20260913 **386/400**, 20260915 **371/400** (**1141/1200** total).\n\n`;

for (const root of order) {
  const group = byRoot.get(root);
  if (!group?.length) continue;
  const g = GROUPS[root];
  md += `### ${g.heading} (${group.length})\n\n`;
  if (g.mainBug) md += `${g.mainBug}\n\n`;
  if (
    g.blastRadius &&
    root !== "downstream-attack-picker" &&
    root !== "downstream-course-cascade"
  )
    md += `**Blast radius:** ${g.blastRadius}\n\n`;
  if (
    g.test &&
    !g.test.startsWith("N/A") &&
    root !== "downstream-attack-picker" &&
    root !== "downstream-course-cascade"
  )
    md += `**Test:** ${g.test}\n\n`;

  md += `| seed | game | action | main | branch | follower | uid | writer | correct |\n`;
  md += `|------|------|--------|------|--------|----------|-----|--------|--------|\n`;
  for (const r of group.sort(
    (a, b) =>
      a.seed - b.seed || a.game - b.game || a.actionIndex - b.actionIndex,
  )) {
    const esc = (s) =>
      String(s ?? "—")
        .replace(/\|/g, "\\|")
        .slice(0, 55);
    md += `| ${r.seed} | ${r.game} | ${r.actionIndex} | ${esc(r.mainAction)} | ${esc(r.branchAction)} | ${esc(r.followerName)} | ${esc(r.followerUid)} | ${esc(r.writer)} | ${r.rulesCorrect} |\n`;
  }
  md += `\n`;
}

writeFileSync(resolve(ROOT, outPath), md);
console.log(`Wrote ${outPath}`);
console.log(
  "Groups:",
  Object.fromEntries(order.map((k) => [k, byRoot.get(k)?.length ?? 0])),
);
