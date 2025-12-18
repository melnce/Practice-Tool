// Debug script to test UID consistency across runs
(globalThis as Record<string, unknown>).HEADLESS = true;

async function main() {
    const { initCardDatabaseNode } = await import("../dist/data/cardLoaderNode.js");
    const { initReplayState } = await import("../dist/logic/core/replayInit.js");
    const { state } = await import("../dist/core/gameState.js");

    console.log("Loading card database...");
    await initCardDatabaseNode();
    console.log("Card database loaded.");

    const SEED = 100001;

    // Initialize and get hand UIDs
    console.log("\nInitializing with seed", SEED);
    initReplayState({ seed: SEED, startingPP: 1, initialDraw: 3 });

    console.log("Blue hand cards:");
    state.blueHand.forEach((c: { name: string; uid: string; cost: number }, i: number) => {
        console.log(`  [${i}] ${c.name} (cost ${c.cost}) - UID: ${c.uid}`);
    });

    // Check first card UID against golden
    console.log("\nExpected UID from golden: uid_chey3cvd");
    const firstCard = state.blueHand[0];
    if (firstCard) {
        console.log("Actual first card UID:", firstCard.uid);
        console.log("Match:", firstCard.uid === "uid_chey3cvd");
    }
}

main().catch(console.error);
