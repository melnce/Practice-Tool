// src/dev/smokeTests.ts
import { state, resetGameState } from "@core/gameState.js"; // .js extension for imports
import { startGame } from "@logic/startGame.js";
import { playCard } from "@logic/core/playCard.js";
import { endTurnBlue, endTurnRed } from "@logic/core/turns.js";
import { runEffects } from "@logic/core/effects.js";
import { CardInstance } from "@core/types.js";

declare const process: any;

// Mock window globals if needed
if (typeof globalThis !== "undefined") {
    (globalThis as any).HEADLESS = true; // suppress logs
}

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`FAIL: ${msg}`);
        process.exit(1);
    } else {
        console.log(`PASS: ${msg}`);
    }
}

async function testScenarioA_StartGame() {
    console.log("--- Scenario A: Start Game ---");
    resetGameState();

    // We need to ensure decks are loaded. startGame loads example_deck if empty.
    await startGame();

    assert(state.gameStarted === true, "Game should be started");
    assert(state.blueHand.length > 0, "Blue should have cards");
    assert(state.redHand.length > 0, "Red should have cards");
    assert(state.blueHP === 20, "Blue HP should be 20");
    assert(state.turnCount >= 1 || state.roundCount >= 1, "Turn count should be initialized");
}

async function testScenarioB_PlayFollower() {
    console.log("--- Scenario B: Play Follower ---");
    resetGameState();
    await startGame();

    // Force add a known follower to Blue Hand
    const goblin: CardInstance = {
        uid: "test_goblin",
        name: "Goblin",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 2,
        can_attack: false
    };
    state.blueHand = [goblin];
    state.bluePP = 1;
    state.isBlueTurn = true;

    // Play it
    playCard(state.blueHand, "blue", 0);

    assert(state.blueBoard.length === 1, "Blue board should have 1 card");
    assert(state.blueBoard[0].name === "Goblin", "Played card should be Goblin");
    assert(state.bluePP === 0, "PP should be spent");
}

async function testScenarioC_DamageLeader() {
    console.log("--- Scenario C: Damage Leader ---");
    resetGameState();
    state.redHP = 20;

    // Run a direct damage effect
    runEffects([{ op: "damage", amount: 3, target: "enemy:leader" }], "blue", null);

    assert(state.redHP === 17, `Red HP should be 17, got ${state.redHP}`);
}

async function runAll() {
    try {
        await testScenarioA_StartGame();
        await testScenarioB_PlayFollower();
        await testScenarioC_DamageLeader();
        console.log("All smoke tests passed!");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runAll();
