import { getPool } from "../src/logic/core/targeting.js";
import { state } from "../src/logic/core/gameState.js";
import { CardInstance } from "../src/logic/core/types.js";
import { makeUid } from "../src/logic/core/rng.js";

// Mock globalThis.HEADLESS for logging check
(globalThis as any).HEADLESS = true;

function createCard(
  name: string,
  type: "Follower" | "Spell" | "Amulet",
): CardInstance {
  return {
    uid: makeUid(),
    name,
    type,
    cost: 1,
    owner: "blue",
  } as CardInstance;
}

function testHandFilter() {
  console.log("=== Testing getPool('hand:follower') ===");

  // Setup State
  state.blueHand = [
    createCard("Fighter", "Follower"),
    createCard("Insight", "Spell"),
    createCard("Amulet", "Amulet"),
  ];
  state.redHand = [];
  state.blueBoard = [];
  state.redBoard = [];

  // Test
  const pool = getPool("hand:follower", "blue");

  console.log("Pool size:", pool.length);
  pool.forEach((c) => console.log(` - ${c.name} (${c.type})`));

  const followers = pool.filter((c) => c.type === "Follower");
  const nonFollowers = pool.filter((c) => c.type !== "Follower");

  if (nonFollowers.length > 0) {
    console.error("FAILURE: Pool contains non-followers!");
    console.error(
      "Non-followers found:",
      nonFollowers.map((c) => c.name),
    );
    process.exit(1);
  } else if (followers.length !== 1) {
    console.error(`FAILURE: Expected 1 follower, found ${followers.length}`);
    process.exit(1);
  } else {
    console.log("SUCCESS: Only followers in pool.");
    process.exit(0);
  }
}

testHandFilter();
