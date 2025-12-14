import { state } from "../src/logic/core/gameState.js";
import { runEffects } from "../src/logic/core/effects/index.js";
import { CardInstance } from "../src/logic/core/types.js";
import { makeUid } from "../src/logic/core/rng.js";
import { adapter } from "../src/logic/core/adapter.js";
import { playCard } from "../src/logic/core/playCard.js";
import { registerRunEffects } from "../src/logic/core/triggers.js";

// Ensure effects loop is registered (mocks regular app startup)
registerRunEffects(runEffects);

// Mock adapter
adapter.render = () => { };

function createCard(name: string, type: "Follower" | "Spell" | "Amulet", cost: number): CardInstance {
    return {
        uid: makeUid(),
        name,
        type,
        cost,
        base_cost: cost,
        owner: "blue",
        can_attack: true
    } as CardInstance;
}

async function testChloe() {
    console.log("=== Verifying Chloe Enhance Fix ===");

    // Setup State
    state.blueHand = [];
    state.blueBoard = [];
    state.bluePP = 10;
    state.blueMaxPP = 10;
    (state as any).activePlayer = "blue";

    // Create Chloe
    const chloe = createCard("Chloe, What a Gal", "Follower", 2);
    // Add enhance logic manually if JSON not loaded, but we expect JSON loader or we mock it?
    // playCard uses getCardDetails. If we don't load JSON, playCard fails.
    // However, verify_fix.ts relies on the fact that we can mock the card object passed to playCard?
    // Or we rely on `playCard` to resolve things.
    // We should stick to what worked before: assumed loaded or mocked.
    // Since I cannot ensure JSON loading in this script easily without async, I'll mock the card entirely with enhance info.
    chloe.test_data = {
        enhance: [
            {
                cost: 8,
                effects: [
                    {
                        op: "select",
                        target: "hand:follower",
                        select_count: 1,
                        effects: [
                            { op: "summon", filter: "selected" },
                            { op: "return_hand_to_deck", target: "self" }
                        ]
                    }
                ]
            }
        ]
    };
    // Inject enhance tiers logic usually handled by database/keyword init
    // But playCard calculates enhance based on state.
    // Let's assume the previous test loaded valid cards.
    // I will skip complex card db loading and just inject the logic into `playCard` flow if possible, 
    // OR assuming `verify_fix` mimics `data/cardDatabase`. 
    // Actually, `verify_fix.ts` likely imported `getCardDetails`. 
    // I'll skip that dependency and mock `chloe` property `enhanceTiers`.
    (chloe as any).enhanceTiers = [
        {
            cost: 8,
            effects: [
                {
                    op: "select",
                    target: "hand:follower",
                    select_count: 1,
                    effects: [
                        { op: "summon", filter: "selected" },
                        { op: "return_hand_to_deck", target: "self" }
                    ]
                }
            ]
        }
    ];

    state.blueHand.push(chloe);

    // Add targets in hand
    const targetFollower = createCard("Target Follower", "Follower", 5);
    state.blueHand.push(targetFollower);

    // Play Chloe as Enhance(8)
    // We mock the UI choice (playCard with choice 0 for enhance)
    // Actually playCard takes (card, owner, choice).
    // Enhance is usually choice index if multiple enhance? Or auto?
    // If we have enhance tiers, `playCard` checks PP.
    // If we have 10 PP, it picks the highest enhance.

    console.log("Playing Chloe with 10 PP...");
    const result = await playCard(chloe, "blue");

    // Check if targeting is pending
    if (state.pendingTargetEffect) {
        console.log("SUCCESS: Targeting triggered!");
        console.log("Pool size:", state.pendingTargetEffect.pool.length);
        if (state.pendingTargetEffect.pool.some(c => c.uid === targetFollower.uid)) {
            console.log("SUCCESS: Target Follower is in pool.");
        } else {
            console.error("FAILURE: Target Follower NOT in pool.");
            process.exit(1);
        }
    } else {
        console.error("FAILURE: No pending target effect triggered.");
        process.exit(1);
    }
}

testChloe().catch(e => {
    console.error(e);
    process.exit(1);
});


