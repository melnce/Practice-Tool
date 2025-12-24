
import fs from "fs";
import path from "path";

// Polyfill window immediately
(global as any).window = {};
(global as any).location = { href: "http://localhost" };
(global as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
(global as any).cancelAnimationFrame = (id: any) => clearTimeout(id);

console.log("Window polyfilled.");

async function runTest() {
    // Dynamic imports to ensure polyfill applies first
    const { createInitialState, state } = await import("../../src/core/gameState.js");
    const { getCardDetails } = await import("../../src/data/cardDatabase.js");
    const { runEffects } = await import("../../src/logic/core/effects/index.js");
    const { fireTrigger } = await import("../../src/logic/core/triggers.js");
    const { onEvolve } = await import("../../src/logic/evolveUtils.js");

    // Setup State
    createInitialState(1);
    state.activePlayer = "first";
    state.isFirstPlayerTurn = true;
    state.turnNumber = 1;

    // Load Suframare data manually from disk
    const jsonPath = path.resolve(process.cwd(), "cards/sets/10004_skybound-dragons.json");
    console.log("Loading cards from:", jsonPath);
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const suframareData = jsonData.find((c: any) => c.name === "Suframare, Wandering Tutor");

    if (!suframareData) throw new Error("Suframare not found in JSON");

    // Inject into cardDatabase
    // @ts-ignore
    if (window.cardDatabase && window.cardDatabase.fullData) {
        // @ts-ignore
        window.cardDatabase.fullData["Suframare, Wandering Tutor"] = suframareData;
        console.log("Injected Suframare into cardDatabase.");
    } else {
        throw new Error("cardDatabase not initialized on window");
    }

    // Mock Suframare
    const suframareBase = getCardDetails("Suframare, Wandering Tutor");
    if (!suframareBase) throw new Error("Card getCardDetails returned null after injection");
    // Cast to any to set uid
    (suframareBase as any).uid = "suframare_1";
    (suframareBase as any).owner = "first";

    // @ts-ignore
    state.players.first.board = [suframareBase];

    // Add a spellboostable card to hand
    const spell = { uid: "spell_1", name: "Insight", type: "Spell", cost: 1, properties: {}, keywords: ["Spellboost"], triggers: [], owner: "first", zone: "hand", spellboostCount: 0 };
    // @ts-ignore
    state.players.first.hand = [spell];

    console.log("--- TEST START ---");
    console.log("Initial Hand Spellboost:", spell.spellboostCount);

    // Initial attack check
    (suframareBase as any).attack = 1;
    (suframareBase as any).defense = 2;
    console.log("Set Suframare ATK to 1.");

    console.log("Triggering EOT (Suframare ATK: 1)...");
    fireTrigger("end_of_turn", "first", {});
    console.log("Hand Spellboost (Expected 1):", spell.spellboostCount);

    // Buff Suframare
    (suframareBase as any).attack = 5;
    console.log("Buffed Suframare ATK to 5.");

    // Trigger EOT again
    console.log("Triggering EOT (Suframare ATK: 5)...");
    fireTrigger("end_of_turn", "first", {});
    // Should be 1 (prev) + 5 = 6
    console.log("Hand Spellboost (Expected 6):", spell.spellboostCount);

    // Evolve Test
    console.log("Evolving Suframare...");
    onEvolve(suframareBase as any, "first", "normal");

    console.log("Keywords:", (suframareBase as any).keywords);
    const hasCantAttack = (suframareBase as any).keywords?.includes("cant_attack");
    console.log("Has CantAttack keyword:", hasCantAttack);

    // Super Evolve Test (RESET)
    (suframareBase as any).hasEvolved = false;
    (suframareBase as any).evoType = undefined;
    (suframareBase as any).keywords = [];
    state.blueSuperEvoCharges = 10;
    state.roundCount = 10;

    console.log("Super-Evolving Suframare...");
    (suframareBase as any).evoType = "super";
    onEvolve(suframareBase as any, "first", "super", { spendPoint: false });
    const hasCantAttackSuper = (suframareBase as any).keywords?.includes("cant_attack");
    console.log("Has CantAttack keyword (Super):", hasCantAttackSuper);
}

runTest().then(() => console.log("TEST COMPLETED SUCCESSFULLY")).catch(e => { console.error(e); process.exit(1); });






