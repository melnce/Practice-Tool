import { state } from "../src/core/gameState.js";
import { playCard } from "../src/logic/core/playCard.js";
import { getCardDetails } from "../src/data/cardDatabase.js";
import { spellboostHand } from "../src/logic/effects/ops/spellboost.js";
import { runEffects } from "../src/logic/core/effects/index.js";

// Mock minimal state
state.blueHand = [];
state.redBoard = [];
state.isBlueTurn = true;
state.bluePP = 10;

// Helper to add card
function addCard(name: string, owner = "blue") {
  const c = getCardDetails(name);
  if (!c) throw new Error("Card not found: " + name);
  const inst = { ...c, uid: Math.random().toString(), spellboostCount: 0 };
  if (owner === "blue") state.blueHand.push(inst);
  return inst;
}

// Helper to add enemy
function addEnemy(name: string) {
  const c = getCardDetails(name);
  const inst = {
    ...c,
    uid: Math.random().toString(),
    defense: 3,
    type: "Follower",
  };
  state.redBoard.push(inst);
  return inst;
}

async function runTest() {
  console.log("=== Testing Runecraft Fixes ===");

  // 1. Flames of Chaos
  console.log("\n--- Testing Flames of Chaos ---");
  const chaos = addCard("Flames of Chaos");
  const enemy1 = addEnemy("Goblin");

  // Boost it 5 times
  chaos.spellboostCount = 5;

  // Play it
  console.log(`Playing Chaos with count ${chaos.spellboostCount}`);
  await playCard(state.blueHand, "blue", state.blueHand.indexOf(chaos));

  // Check enemy defense (should be 3 - 5 = -2, or 0 if clamped, but simpler: check if it died or took damage)
  // Actually log says "[Damage] Resolving..." so I'll check that output.
  console.log("Enemy 1 Defense:", enemy1.defense);

  // 2. William
  console.log("\n--- Testing William ---");
  const william = addCard("William, Mysterian Student");
  // Boost it 3 times
  william.spellboostCount = 3;

  // Play
  await playCard(state.blueHand, "blue", state.blueHand.indexOf(william));

  // Check if on board and count reset
  const williamBoard = state.blueBoard.find((c) => c.name.includes("William"));
  if (williamBoard) {
    console.log(
      "William on board spellboostCount:",
      williamBoard.spellboostCount,
    ); // Should be 0
  } else {
    console.error("William not found on board");
  }

  // 3. Stormy Blast
  console.log("\n--- Testing Stormy Blast ---");
  const stormy = addCard("Stormy Blast");
  const enemy2 = addEnemy("Fighter"); // 3 def
  stormy.spellboostCount = 1; // 1+2 = 3 dmg

  // We can't easily simulate selection in this headless script without mocking the UI selection flow
  // But we can check if it requires selection now.
  // Actually playCard might fail if selection needed and not provided in headless?
  // The previous bug was "targets all".
  // I'll just verify the JSON change was applied by inspecting the card details loaded.
  const stormyTemplate = getCardDetails("Stormy Blast");
  const spellEff = stormyTemplate.spell[0];
  console.log("Stormy Blast Effect:", JSON.stringify(spellEff));

  console.log("=== Test Complete ===");
}

runTest().catch(console.error);
