import { state, resetGameState } from "../../src/core/gameState.js";
import {
  handleGainCrest,
  crestAddCounter,
} from "../../src/logic/effects/crest.js";
import { runEffects } from "../../src/logic/core/effects/index.js";

// Setup environment
(globalThis as any).HEADLESS = true;
resetGameState();

console.log("=== START DEBUG ===");

try {
  // 1. Gain Crest
  handleGainCrest(
    { name: "Faith: Sham-Nacha, Heir to Entwining" } as any,
    "blue",
  );

  // 2. Add Counters
  crestAddCounter("blue", "Faith: Sham-Nacha, Heir to Entwining", "faith", 15);
  console.log("Faith Count:", state.blueCrests[0].counters.faith);

  // 3. Run Effect
  const fanfare = [
    {
      op: "crest_pay_counter",
      crest: "Faith: Sham-Nacha, Heir to Entwining",
      counter: "faith",
      amount: 10,
      on_success_effects: [{ op: "mode_bonus", amount: 1 }],
    },
  ];

  console.log("Running runEffects...");
  runEffects(fanfare as any, "blue", null);

  console.log("=== DONE DEBUG ===");
  console.log("Final Faith:", state.blueCrests[0].counters.faith);
  console.log("Final Bonus:", state.blueChooseBonus);
} catch (e) {
  console.error("CRASHED:", e);
}
