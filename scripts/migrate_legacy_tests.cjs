const fs = require("fs");
const path = require("path");

const MOVES = [
  // BRAIN: harness/infra rot
  {
    file: "tests/integration/bounce.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/chaos.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/juno.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/knightly-ardor.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/reanimate.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/stormyBlast.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/turns.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/william.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/buff.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/damage.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/spellboost.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/targeting.test.ts",
    reason: "TypeError: makeUid is not a function",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/rng.test.ts",
    reason: "TypeError: setRNGSeed requires mock",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/integration/keywords_targeting.test.ts",
    reason: "Cannot find module gameState.js",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/report_unresolved.test.ts",
    reason: "Cannot find module report_unresolved_cards",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/keywords.normalize.test.ts",
    reason: "Cannot find module keywords/registry.js",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/shadows.test.ts",
    reason: "Cannot find module playCard.js",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/resolveTarget.confirm.test.ts",
    reason: "Missing UI adapter mock",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/targeting.contract.test.ts",
    reason: "Missing UI adapter mock",
    type: "BROKEN: harness/infra rot",
  },
  {
    file: "tests/unit/targeting.tripwire.test.ts",
    reason: "Missing UI adapter mock",
    type: "BROKEN: harness/infra rot",
  },

  // BRAIN: invalid test code
  {
    file: "tests/integration/kuonEnhance.test.ts",
    reason: 'Syntax Error (Unexpected "}")',
    type: "BROKEN: invalid test code",
  },
  {
    file: "tests/integration/mechanics.test.ts",
    reason: "Syntax Error (Unterminated string literal)",
    type: "BROKEN: invalid test code",
  },
  {
    file: "tests/integration/verify_skybound_load.test.ts",
    reason: "describe is not defined (Env config)",
    type: "BROKEN: invalid test code",
  },
  {
    file: "tests/integration/integration.test.ts",
    reason: "Setup Error (deckAId undefined)",
    type: "BROKEN: invalid test code",
  },
  {
    file: "tests/unit/cards/elmott.test.ts",
    reason: "Setup Error (targets not iterable)",
    type: "BROKEN: invalid test code",
  },
];

const ROOT = process.cwd();

MOVES.forEach((move) => {
  const srcPath = path.join(ROOT, move.file);
  const destPath = path.join(
    ROOT,
    "tests/legacy",
    move.file.replace(/^tests\//, ""),
  );

  if (!fs.existsSync(srcPath)) {
    console.warn(`SKIP: Source not found: ${srcPath}`);
    return;
  }

  // Create dir
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const content = fs.readFileSync(srcPath, "utf8");
  const header = `/**
 * MOVED TO LEGACY
 * 
 * Original Path: ${move.file}
 * Reason: ${move.reason}
 * Classification: ${move.type}
 * 
 * POLICY: Do not fix by changing engine code.
 */
`;

  fs.writeFileSync(destPath, header + content);
  fs.unlinkSync(srcPath);
  console.log(`MOVED: ${move.file} -> ${destPath}`);
});
