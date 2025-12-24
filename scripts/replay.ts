import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Set HEADLESS flag BEFORE any engine imports
(globalThis as any).HEADLESS = true;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Redirect logs to crash.log for debugging
const originalLog = console.log;
const originalError = console.error;

const reportDir = "reports";
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}
const logFile = path.join(reportDir, "crash.log");

// Clear log file
if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

function appendLog(msg: string) {
  try {
    fs.appendFileSync(logFile, msg + "\n");
  } catch {
    /* ignore */
  }
}

console.log = (...args: unknown[]) => {
  const msg = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  originalLog(...args);
  appendLog(msg);
};
console.error = (...args: unknown[]) => {
  const msg = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  originalError(...args);
  appendLog("[ERROR] " + msg);
};

// Ensure golden directory exists
const GOLDEN_DIR = path.resolve(__dirname, "../replays/golden");
if (!fs.existsSync(GOLDEN_DIR)) {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
}

// Stable pretty stringify for deterministic JSON output
function stablePrettyStringify(obj: unknown): string {
  return JSON.stringify(
    obj,
    (key, value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>)
          .sort()
          .reduce((sorted: Record<string, unknown>, key) => {
            sorted[key] = (value as Record<string, unknown>)[key];
            return sorted;
          }, {});
      }
      return value;
    },
    2,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const updateMode = args.includes("--update");
  const scenarioFlagIndex = args.indexOf("--scenario");
  const targetId =
    scenarioFlagIndex !== -1 ? args[scenarioFlagIndex + 1] : null;

  console.log("Importing engine modules from core...");

  // Dynamic imports from compiled dist/ output
  const { runWithReplay } =
    (await import("../dist/logic/core/replay.js")) as any;
  const { diffReplays, formatReplayDiff } =
    (await import("../dist/logic/core/replayVerify.js")) as any;
  const { REPLAY_SCENARIOS } =
    (await import("../dist/logic/core/replayScenarios.js")) as any;
  const { dispatchAction } =
    (await import("../dist/logic/core/dispatch.js")) as any;
  const { resetGameState, state, createInitialState, resetStateInstance } =
    (await import("../dist/core/gameState.js")) as any;
  const { setGlobalTrace, getGlobalTrace } =
    (await import("../dist/logic/core/effects/trace.js")) as any;
  const { initReplayState } =
    (await import("../dist/logic/core/replayInit.js")) as any;

  const { initCardDatabaseNode } =
    (await import("../dist/data/cardLoaderNode.js")) as any;
  const { ReplayInvariantError } =
    (await import("../dist/logic/core/replayInvariants.js")) as any;

  console.log("Engine modules loaded successfully.");

  // Initialize card database from disk
  console.log("Loading card database...");
  await initCardDatabaseNode();
  console.log("Card database loaded.");

  // Adapter for dispatch - injects trace globally
  const applyAction = (
    currentState: unknown,
    action: unknown,
    traceCtx?: { trace: unknown },
  ) => {
    setGlobalTrace(traceCtx?.trace);
    try {
      return dispatchAction(currentState as unknown, action as unknown, null);
    } finally {
      setGlobalTrace(undefined);
    }
  };

  let failureCount = 0;
  console.log(`\nReplay Tool: ${updateMode ? "UPDATE" : "VERIFY"} mode\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Shuffle Determinism Golden Check (Exact Assertions)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Running Shuffle Determinism Check...");
  const checkStateA = createInitialState(1);
  const checkStateB = createInitialState(1);

  // Init with two different seeds
  initReplayState(
    { seed: 12345, initialDraw: 0, strict: !updateMode },
    checkStateA,
  );
  initReplayState(
    { seed: 67890, initialDraw: 0, strict: !updateMode },
    checkStateB,
  );

  const actualA = checkStateA.players.first.deck.slice(0, 5).map((c: any) => c.name);
  const actualB = checkStateB.players.first.deck.slice(0, 5).map((c: any) => c.name);

  // Expected values - populate these after first run triggers failure with actuals
  const goldenA: string[] = [
    "Goblin",
    "Centaur Centurion",
    "Goblin",
    "Goblin",
    "May, Journey Elf",
  ];
  const goldenB: string[] = [
    "Flashstep Quickblader",
    "May, Journey Elf",
    "Indomitable Fighter",
    "Bug Alert",
    "Goblin",
  ];

  const diffA = JSON.stringify(actualA) !== JSON.stringify(goldenA);
  const diffB = JSON.stringify(actualB) !== JSON.stringify(goldenB);

  if (diffA || diffB) {
    console.error(
      "[FAIL] Shuffle Determinism: Mismatch against golden expectation.",
    );
    if (diffA)
      console.error(
        `  Seed 12345 Expected: ${JSON.stringify(goldenA)} \n  Seed 12345 Actual:   ${JSON.stringify(actualA)} `,
      );
    if (diffB)
      console.error(
        `  Seed 67890 Expected: ${JSON.stringify(goldenB)} \n  Seed 67890 Actual:   ${JSON.stringify(actualB)} `,
      );
    process.exit(1);
  } else {
    console.log("[PASS] Shuffle Determinism: Correct.");
  }

  // ─────────────────────────────────────────────────────────────────────────────

  for (const scenario of REPLAY_SCENARIOS) {
    if (targetId && scenario.id !== targetId) continue;

    console.log(`Running scenario: ${scenario.id} ...`);

    // Check if this is a dynamic scenario that needs deck initialization
    const isDynamic =
      "build" in scenario && typeof scenario.build === "function";
    const goldenPath = path.join(GOLDEN_DIR, `${scenario.id}.json`);

    // Reset state for each scenario
    setGlobalTrace(undefined); // Clear trace
    const initParams = scenario.initParams || {};
    if (isDynamic) {
      initReplayState({
        seed: scenario.seed,
        startingPP: initParams.startingPP ?? 1,
        initialDraw: initParams.initialDraw ?? 3,
        strict: !updateMode,
      });
    } else {
      resetGameState(scenario.seed);
    }
    const initialStateHash = stablePrettyStringify(state);

    // Generate actions if dynamic
    let actions: readonly unknown[];
    let meta: Record<string, any> = {};

    if (isDynamic) {
      console.log(
        `[DEBUG] Scenario ${scenario.id} IS DYNAMIC.InitParams: `,
        initParams,
      );
      const buildFn = (scenario as any).build;
      console.log(`[DEBUG] Calling build function...`);
      const result = buildFn(state);
      console.log(
        `[DEBUG] Build returned: `,
        result ? (Array.isArray(result) ? "Array" : "Object") : "null",
      );

      if (Array.isArray(result)) {
        actions = result;
      } else {
        actions = result.actions;
        meta = result.meta || {};
      }
    } else {
      console.log(`[DEBUG] Scenario ${scenario.id} is STATIC.`);
      actions = scenario.actions!;
    }

    // Execute actions
    fs.appendFileSync(
      logFile,
      `\n[DEBUG] Scenario ${scenario.id} Actions: ${JSON.stringify(actions)} \n`,
    );

    console.log(`[DEBUG] Actions to dispatch: `, actions);
    if (!actions) {
      console.error("[DEBUG FAIL] Actions array is null/undefined!");
    } else {
      actions.forEach((a, i) => console.log(`[DEBUG] Action[${i}]: `, a));
    }

    for (const action of actions) {
      dispatchAction(state, action as any);
    }

    const capsule = {
      id: scenario.id,
      initial: initialStateHash,
      // Store strict JSON-safe trace
      trace: JSON.parse(JSON.stringify(getGlobalTrace()?.events ?? [])),
      final: stablePrettyStringify(state),
    };

    // Compare with golden
    let goldenCapsule: any = null;

    if (fs.existsSync(goldenPath)) {
      goldenCapsule = JSON.parse(fs.readFileSync(goldenPath, "utf-8"));
    }

    // If verify mode, check diff
    if (!updateMode) {
      if (!goldenCapsule) {
        const msg = `  FAIL: Missing golden file for ${scenario.id}`;
        console.error(msg);
        fs.appendFileSync(logFile, msg + "\n");
        failureCount++;
        // Continue to invariants? Might fail if we assume golden state
      } else {
        const diff = diffReplays(capsule, goldenCapsule);
        if (!diff.ok) {
          const msg = `  FAIL: Mismatch in ${scenario.id} \n${formatReplayDiff(diff)} `;
          console.error(msg);
          fs.appendFileSync(logFile, msg + "\n");
          failureCount++;
        }
      }
    } else {
      // Update mode: Write golden
      fs.writeFileSync(goldenPath, stablePrettyStringify(capsule) + "\n");
      console.log(`  Updated golden file.`);
    }

    // Check invariants (always run checks if invariant present)
    if (scenario.invariants && scenario.invariants.length > 0) {
      try {
        // We assume state global holds final state
        const finalState = state; // Live singleton is the final state

        // REFACTOR: Instead of resetting singleton and killing final state,
        // we create a FRESH independent state instance for the initial state comparison.
        // This satisfies "Independent Instances" requirement and avoids Deep Clone.

        // createInitialState creates a NEW object, independent of singleton `state`
        const initialStateForInv = createInitialState(1);

        // Initialize it exactly as the singleton was initialized
        if (isDynamic) {
          initReplayState(
            {
              seed: scenario.seed,
              startingPP: initParams.startingPP ?? 1,
              initialDraw: initParams.initialDraw ?? 3,
              strict: !updateMode,
            },
            initialStateForInv,
          ); // Pass target instance!
        } else {
          resetStateInstance(initialStateForInv, scenario.seed);
        }

        // Now run invariants using independent objects
        for (const inv of scenario.invariants) {
          inv.check({
            scenarioId: scenario.id,
            initialState: initialStateForInv,
            finalState: finalState,
            trace: capsule.trace, // Use trace from capsule
            meta, // Pass metadata
          });
        }
      } catch (e: any) {
        if (e instanceof ReplayInvariantError) {
          const msg = `  FAIL: Invariant "${e.invariantId}" failed in ${scenario.id} \n    ${e.message} `;
          console.error(msg);
          fs.appendFileSync(logFile, msg + "\n");
          failureCount++;
        } else {
          fs.appendFileSync(logFile, `UNHANDLED ERROR: ${e} \n`);
          throw e;
        }
      }
    }

    console.log(`  Done.`);
  }

  if (failureCount > 0) {
    console.error(`\n${failureCount} failure(s).`);
    fs.appendFileSync(logFile, `\n${failureCount} failure(s) occurred.\n`);
    process.exit(1);
  } else {
    console.log("\nSuccess.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Replay CLI error:", err);
  fs.appendFileSync(logFile, `Error: ${err.message} \nStack: ${err.stack} \n`);
  process.exit(1);
});
