#!/usr/bin/env node
/** Compare perGame entries and traces between two soak summary dirs. */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const [mainDir, branchDir] = process.argv.slice(2);
if (!mainDir || !branchDir) {
  console.error(
    "Usage: node scripts/compare-perGame.mjs <mainSummaryDir> <branchSummaryDir>",
  );
  process.exit(1);
}

function loadSummary(dir) {
  const p = join(dir, "summary.json");
  return JSON.parse(readFileSync(p, "utf-8"));
}

function loadTrace(dir, seed, gameIndex) {
  const nested = join(dir, String(seed), `seed${seed}_game${gameIndex}.json`);
  const flat = join(dir, `seed${seed}_game${gameIndex}.json`);
  const p = existsSync(nested) ? nested : flat;
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function actionKey(a) {
  return JSON.stringify(a);
}

function firstTraceDiff(mainTrace, branchTrace) {
  const len = Math.min(mainTrace.length, branchTrace.length);
  for (let i = 0; i < len; i++) {
    if (actionKey(mainTrace[i]) !== actionKey(branchTrace[i])) {
      return i;
    }
  }
  if (mainTrace.length !== branchTrace.length) return len;
  return -1;
}

for (const seed of [20260910, 20260913, 20260915]) {
  const mainSum = loadSummary(join(mainDir, String(seed)));
  const branchSum = loadSummary(join(branchDir, String(seed)));
  const mainMap = new Map(mainSum.perGame.map((g) => [g.gameIndex, g]));
  const branchMap = new Map(branchSum.perGame.map((g) => [g.gameIndex, g]));
  const hashDiffs = [];
  for (const [idx, mg] of mainMap) {
    const bg = branchMap.get(idx);
    if (!bg) continue;
    if (mg.finalHash !== bg.finalHash) {
      hashDiffs.push({ seed, gameIndex: idx, main: mg, branch: bg });
    }
  }
  const mainHashes = new Set([...mainMap.values()].map((g) => g.finalHash));
  const branchHashes = new Set([...branchMap.values()].map((g) => g.finalHash));
  let identical = 0;
  for (const g of mainMap.values()) {
    const bg = branchMap.get(g.gameIndex);
    if (bg && g.finalHash === bg.finalHash) identical++;
  }
  console.log(`\n=== seed ${seed} ===`);
  console.log(
    `games: main=${mainSum.perGame.length} branch=${branchSum.perGame.length}`,
  );
  console.log(`hash-identical: ${identical}/${mainSum.perGame.length}`);
  console.log(`hash-diverged: ${hashDiffs.length}`);
  for (const d of hashDiffs.slice(0, 20)) {
    const mt = loadTrace(join(mainDir, String(seed)), seed, d.gameIndex);
    const bt = loadTrace(join(branchDir, String(seed)), seed, d.gameIndex);
    const actionIdx =
      mt && bt ? firstTraceDiff(mt.trace ?? [], bt.trace ?? []) : -1;
    console.log(
      JSON.stringify({
        seed: d.seed,
        game: d.gameIndex,
        actionIndex: actionIdx,
        mainOutcome: d.main.outcome,
        branchOutcome: d.branch.outcome,
        mainActions: d.main.actions,
        branchActions: d.branch.actions,
      }),
    );
  }
}
