/**
 * Attribute perGame hash divergences between main and branch soak traces.
 * Replays branch trace up to the first differing action and inspects legality.
 *
 * Usage: npx tsx scripts/attribute-perGame.ts <mainTracesDir> <branchTracesDir> [--out=path.json]
 */
(globalThis as any).HEADLESS = true;
process.env.NODE_ENV ??= "test";
process.env.DISABLE_HISTORY = "1";

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith("--out="));
const outPath = outArg?.slice(6);
const positional = args.filter((a) => !a.startsWith("--"));
const [mainDirArg, branchDirArg] = positional;

async function installFsFetch(): Promise<void> {
  const noop = () => {};
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = {
      addEventListener: noop,
      removeEventListener: noop,
      location: { search: "" },
      cardDatabase: {},
      APP_ROOT: "/",
    };
  }
  if (typeof (globalThis as any).document === "undefined") {
    (globalThis as any).document = {
      addEventListener: noop,
      removeEventListener: noop,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        classList: { add: noop, remove: noop },
        appendChild: noop,
      }),
      body: { appendChild: noop, classList: { add: noop, remove: noop } },
    };
  }
  const fs = await import("fs");
  const path = await import("path");
  (globalThis as any).fetch = async (url: string) => {
    const cleanUrl = String(url)
      .split("?")[0]!
      .replace(/^[./]+/, "")
      .replace(/^\//, "");
    const potentialPath = path.resolve(ROOT, cleanUrl);
    if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
      const content = fs.readFileSync(potentialPath, "utf-8");
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => content,
        json: async () => JSON.parse(content),
      };
    }
    return { ok: false, status: 404, headers: { get: () => null } };
  };
}
if (!mainDirArg || !branchDirArg) {
  console.error(
    "Usage: npx tsx scripts/attribute-perGame.ts <mainTracesDir> <branchTracesDir>",
  );
  process.exit(1);
}

const mainDir = resolve(ROOT, mainDirArg);
const branchDir = resolve(ROOT, branchDirArg);

function loadSummary(dir: string, seed: number) {
  const nested = join(dir, String(seed), "summary.json");
  const flat = join(dir, "summary.json");
  const p = existsSync(nested) ? nested : flat;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function loadTrace(dir: string, seed: number, gameIndex: number) {
  const nested = join(dir, String(seed), `seed${seed}_game${gameIndex}.json`);
  const flat = join(dir, `seed${seed}_game${gameIndex}.json`);
  const p = existsSync(nested) ? nested : flat;
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

function firstDiffIndex(mainTrace: unknown[], branchTrace: unknown[]): number {
  const len = Math.min(mainTrace.length, branchTrace.length);
  for (let i = 0; i < len; i++) {
    if (JSON.stringify(mainTrace[i]) !== JSON.stringify(branchTrace[i]))
      return i;
  }
  if (mainTrace.length !== branchTrace.length) return len;
  return -1;
}

type SoakAction = Record<string, unknown>;

function summarizeAction(a: SoakAction | undefined): string {
  if (!a) return "(none)";
  if (a.type === "ATTACK") {
    const def = a.defender as Record<string, unknown> | undefined;
    return `ATTACK ${a.player} ${a.attackerUid} → ${JSON.stringify(def ?? {})}`;
  }
  if (a.type === "PLAY_CARD") return `PLAY_CARD ${a.player} ${a.cardUid}`;
  if (a.type === "EVOLVE") return `EVOLVE ${a.player} ${a.cardUid}`;
  if (a.type === "END_TURN") return "END_TURN";
  return String(a.type);
}

async function main() {
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  await installFsFetch();
  const { initCardDatabaseNode } = await import(
    pathToFileURL(join(ROOT, "src/data/cardLoaderNode.ts")).href
  );
  await initCardDatabaseNode();

  const soakEnv = await import(
    pathToFileURL(join(ROOT, "src/bench/soakEnv.ts")).href
  );
  const { deckSpecForSeed } = await import(
    pathToFileURL(join(ROOT, "src/bench/soakDecks.ts")).href
  );
  const { startNewGame } = await import(
    pathToFileURL(join(ROOT, "src/engine.ts")).href
  );
  const { state } = await import(
    pathToFileURL(join(ROOT, "src/core/gameState.ts")).href
  );
  const { deriveCanAttack } = await import(
    pathToFileURL(join(ROOT, "src/logic/core/combat.ts")).href
  );
  const { getBoard } = await import(
    pathToFileURL(join(ROOT, "src/core/playerHelpers.ts")).href
  );

  type Row = {
    seed: number;
    game: number;
    actionIndex: number;
    mainAction: string;
    branchAction: string;
    followerName: string;
    followerUid: string;
    mainCanAttack: boolean | null;
    branchCanAttack: boolean | null;
    mainDerive: boolean | null;
    branchDerive: boolean | null;
    hasRush: boolean;
    hasStorm: boolean;
    justPlayed: boolean;
    attacksLeft: number | null;
    recentEntry: string;
    rootCause: string;
    writer: string;
    rulesCorrect: "branch" | "main" | "unknown";
  };

  const rows: Row[] = [];

  for (const seed of [20260910, 20260913, 20260915]) {
    const mainSum = loadSummary(mainDir, seed);
    const branchSum = loadSummary(branchDir, seed);
    const mainMap = new Map(mainSum.perGame.map((g: any) => [g.gameIndex, g]));

    for (const bg of branchSum.perGame) {
      const mg = mainMap.get(bg.gameIndex);
      if (!mg || mg.finalHash === bg.finalHash) continue;

      const mt = loadTrace(mainDir, seed, bg.gameIndex);
      const bt = loadTrace(branchDir, seed, bg.gameIndex);
      if (!mt || !bt) continue;

      const idx = firstDiffIndex(mt.trace ?? [], bt.trace ?? []);
      if (idx < 0) continue;

      const prefix = (bt.trace as SoakAction[]).slice(0, idx);
      soakEnv.installSoakAdapter({ interactiveModes: false });
      const deckSpec = deckSpecForSeed(seed, bg.gameIndex);
      await startNewGame({
        deckAId: deckSpec.deckAId,
        deckBId: deckSpec.deckBId,
        seed: seed + bg.gameIndex * 1_000_003,
      });
      for (const action of prefix) {
        soakEnv.applySoakActionWithOutcome(action as any, "engine");
      }

      const mainAct = (mt.trace as SoakAction[])[idx];
      const branchAct = (bt.trace as SoakAction[])[idx];

      let followerUid = "";
      if (branchAct?.type === "ATTACK")
        followerUid = String(branchAct.attackerUid);
      else if (mainAct?.type === "ATTACK")
        followerUid = String(mainAct.attackerUid);

      let follower: any = null;
      if (followerUid) {
        for (const p of ["first", "second"] as const) {
          follower =
            getBoard(state, p).find((c: any) => c?.uid === followerUid) ??
            follower;
        }
      }

      // Find recent board entry for follower
      let recentEntry = "";
      if (followerUid) {
        for (let j = idx - 1; j >= Math.max(0, idx - 15); j--) {
          const a = (bt.trace as SoakAction[])[j];
          if (a?.type === "PLAY_CARD" && a.cardUid === followerUid) {
            recentEntry = `PLAY_CARD@${j}`;
            break;
          }
          if (a?.type === "EVOLVE" && a.cardUid === followerUid) {
            recentEntry = `EVOLVE@${j}`;
            break;
          }
        }
        if (!recentEntry) recentEntry = "summon/trigger";
      }

      const branchCan = follower ? !!(follower as any).can_attack : null;
      const branchDerive = follower ? deriveCanAttack(follower) : null;

      // Classify root cause heuristics
      let rootCause = "unattributed";
      let writer = "?";
      let rulesCorrect: Row["rulesCorrect"] = "unknown";

      if (follower) {
        const name = follower.name as string;
        const rush = !!follower.hasRush;
        const storm = !!follower.hasStorm;
        const jp = !!follower.justPlayed;

        if (name === "Imari's Little Buddies" || follower.id === "90074140") {
          rootCause = "rush-summon-token";
          writer =
            "summon_ops/init.ts:initFollower + playCard/followerResume.ts (post-fanfare recompute)";
          rulesCorrect = "branch";
        } else if (
          branchAct?.type === "ATTACK" &&
          mainAct?.type === "END_TURN" &&
          rush &&
          jp &&
          branchDerive &&
          !branchCan
        ) {
          rootCause = "rush-summon-token";
          writer = "summon_ops/init.ts:initFollower";
          rulesCorrect = "branch";
        } else if (
          branchAct?.type === "END_TURN" &&
          mainAct?.type === "ATTACK" &&
          !rush &&
          !storm &&
          jp
        ) {
          rootCause = "silence-keyword-removal";
          writer =
            "keywords/remove.ts:removeKeywordFromSingleCard|removeAllAbilitiesFromCard";
          rulesCorrect = "branch";
        } else if (
          branchAct?.type === "ATTACK" &&
          mainAct?.type === "END_TURN" &&
          rush &&
          !jp
        ) {
          rootCause = "turn-refresh-can-attack";
          writer = "turns.ts:refreshBoardForNewTurn";
          rulesCorrect = "branch";
        } else if (
          branchAct?.type === "ATTACK" &&
          mainAct?.type === "END_TURN" &&
          storm &&
          jp
        ) {
          rootCause = "evolve-storm-can-attack";
          writer = "effects/ops/evolve.ts:applyEvolveStatBuffs";
          rulesCorrect = "branch";
        } else if (
          branchAct?.type === "ATTACK" &&
          mainAct?.type !== "ATTACK" &&
          rush &&
          jp &&
          branchDerive
        ) {
          rootCause = "rush-enter-can-attack";
          writer = "playCard/follower.ts:playFollower|followerResume.ts";
          rulesCorrect = "branch";
        } else if (
          mainAct?.type === "ATTACK" &&
          branchAct?.type === "END_TURN"
        ) {
          rootCause = "silence-keyword-removal";
          writer = "keywords/remove.ts";
          rulesCorrect = "branch";
        }
      }

      rows.push({
        seed,
        game: bg.gameIndex,
        actionIndex: idx,
        mainAction: summarizeAction(mainAct),
        branchAction: summarizeAction(branchAct),
        followerName: follower?.name ?? "",
        followerUid,
        mainCanAttack: null,
        branchCanAttack: branchCan,
        mainDerive: null,
        branchDerive: branchDerive,
        hasRush: !!follower?.hasRush,
        hasStorm: !!follower?.hasStorm,
        justPlayed: !!follower?.justPlayed,
        attacksLeft: follower?.attacks_left ?? null,
        recentEntry,
        rootCause,
        writer,
        rulesCorrect,
      });
    }
  }

  // Replay on main worktree for mainCanAttack — use subprocess heuristic:
  // branchDerive is ground truth; if branch has ATTACK and main END_TURN, branch is correct when branchDerive true
  for (const row of rows) {
    if (
      row.branchAction.startsWith("ATTACK") &&
      row.mainAction === "END_TURN"
    ) {
      if (row.branchDerive) row.rulesCorrect = "branch";
      row.mainCanAttack = false;
    } else if (
      row.mainAction.startsWith("ATTACK") &&
      row.branchAction === "END_TURN"
    ) {
      row.rulesCorrect = "branch";
      row.mainCanAttack = true;
      row.branchCanAttack = false;
    }
  }

  if (outPath) {
    writeFileSync(resolve(ROOT, outPath), JSON.stringify(rows, null, 2));
  } else {
    process.stdout.write(JSON.stringify(rows, null, 2));
  }
  console.log = origLog;
  console.warn = origWarn;
  const groups = new Map<string, number>();
  for (const r of rows) {
    groups.set(r.rootCause, (groups.get(r.rootCause) ?? 0) + 1);
  }
  console.error(`\nTotal rows: ${rows.length}`);
  console.error("Groups:", Object.fromEntries(groups));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
