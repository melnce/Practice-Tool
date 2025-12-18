// Debug script to discover cards in hand for a given seed
(globalThis as Record<string, unknown>).HEADLESS = true;

async function main() {
    const { resetGameState, state } = await import("../dist/core/gameState.js");

    const seeds = [12345, 999, 54321, 42, 77777, 31337, 88888, 11111];

    for (const seed of seeds) {
        resetGameState(seed);
        console.log(`\n=== Seed ${seed} ===`);
        console.log(`Blue Hand (${state.blueHand.length} cards):`);
        state.blueHand.forEach((c: { name: string; type: string; cost: number; uid: string }, i: number) => {
            console.log(`  [${i}] ${c.name} (${c.type}, cost ${c.cost})`);
        });
        console.log(`\nBlue PP: ${state.currentPPBlue}/${state.maxPPBlue}`);
    }
}

main().catch(console.error);
