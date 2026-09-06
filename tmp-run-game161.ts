import "./tests/mechanics/setup.js";
import { runSoakGame } from "./src/bench/soakEnv.js";

(globalThis as any).HEADLESS = true;
process.env.DISABLE_HISTORY = "1";

const result = await runSoakGame({
  seed: 20260909,
  gameIndex: 161,
  turnCap: 60,
  actionCap: 800,
  historyCheck: true,
  dispatch: "engine",
  fuse: true,
  interactiveModes: true,
});
console.log("outcome:", result.outcome);
if (result.error) console.log("error:", result.error.slice(0, 1500));
