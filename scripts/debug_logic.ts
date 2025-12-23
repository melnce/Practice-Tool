import { resolveAmountWithOverflow } from "../src/logic/effects/ops/damage.js";
import fs from "fs";
import path from "path";

// Mock Card
const mockCard = {
  name: "Stormy Blast",
  spellboostCount: 5,
  uid: "mock-123",
};

// Mock Context
const context = {
  sourceCard: mockCard,
};

// Test Damage Logic
console.log("--- Testing Damage Logic ---");
// We need to access the internal helper or just expose the function.
// Since resolveAmountWithOverflow is not exported, we can test via handleDamage wrapper or similar.
// But we can't easily import non-exported functions.
// Instead, let's look at the regex manually or rely on 'handleDamage' if simpler.
// Actually runEffects -> handleDamage is complex.
// Let's just create a regex test here matching the code logic.

const s = "{spellboost+2}";
const match = s.match(/{spellboost\+(\d+)}/);
console.log(`String: '${s}'`);
console.log(`Regex match:`, match);
if (match) {
  const val = 5 + parseInt(match[1], 10);
  console.log(`Calculated value: ${val}`);
}

// Test Puppet Name
console.log("\n--- Finding Puppet Token ---");
try {
  const tokensPath = path.resolve("cards/token_details.json");
  const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
  const puppets = tokens.filter((t: any) =>
    t.name.toLowerCase().includes("puppet"),
  );
  console.log(
    "Found Puppets:",
    puppets.map((t: any) => `${t.name} (Tribe: ${t.tribe || t.tribes})`),
  );
} catch (e) {
  console.error("Failed to read tokens:", e);
}
