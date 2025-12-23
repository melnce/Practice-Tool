// Imports from src
import fs from "fs";
import { initReplayState } from "../src/logic/core/replayInit.js";
import { GameState } from "../src/core/types.js";
import { state } from "../src/core/gameState.js";
import { initCardDatabaseNode } from "../src/data/cardLoaderNode.js";
import { isCardDatabaseInitialized } from "../src/data/cardIndex.js";
import { setGlobalTrace } from "../src/logic/core/effects/trace.js";

async function main() {
  // Disable tracing to avoid log flood
  setGlobalTrace(undefined);

  await initCardDatabaseNode();
  console.log("Card Database initialized.");

  // Clear output file
  fs.writeFileSync("found_seeds.txt", "");

  for (let i = 0; i < 200; i++) {
    const seed = 100000 + i;

    initReplayState({ seed, startingPP: 1, initialDraw: 3 });

    const hasGoblin = state.blueHand.some((c) => c.name === "Goblin");
    const hasMay = state.blueHand.some((c) => c.name === "May, Journey Elf");

    if (hasGoblin && hasMay) {
      fs.appendFileSync(
        "found_seeds.txt",
        `Found Seed ${seed}: Has Goblin AND May\n`,
      );
    } else if (hasGoblin) {
      fs.appendFileSync("found_seeds.txt", `Found Seed ${seed}: Has Goblin\n`);
    }
  }
}

main().catch(console.error);
