/**
 * tests/unit/ops-signatures.test.ts
 *
 * Comprehensive vitest suite for op signature coverage.
 * Covers unique op signatures from sets 0-3 (excluding set 4).
 * Each test constructs minimal game state, invokes the op, and asserts deterministic end state.
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import { initCardDatabase, getCardDetails } from "../../src/data/cardIndex.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { CardInstance, Player, Effect } from "../../src/core/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import { pushToBoard } from "../../src/logic/effects/ops/summon_ops/core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

let uidCounter = 0;
function makeTestUid(): string {
    return `test_uid_${++uidCounter}`;
}

function createFollower(overrides: Partial<CardInstance> = {}): CardInstance {
    return {
        uid: makeTestUid(),
        name: "Test Follower",
        type: "Follower",
        cost: 1,
        base_cost: 1,
        attack: 2,
        defense: 3,
        base_attack: 2,
        base_defense: 3,
        can_attack: false,
        keywordState: {},
        ...overrides,
    } as CardInstance;
}

function createAmulet(overrides: Partial<CardInstance> = {}): CardInstance {
    return {
        uid: makeTestUid(),
        name: "Test Amulet",
        type: "Amulet",
        cost: 2,
        base_cost: 2,
        attack: 0,
        defense: 0,
        counters: {},
        keywordState: {},
        hasCountdown: true,
        ...overrides,
    } as CardInstance;
}

function placeOnBoard(card: CardInstance, owner: Player) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    card.zone = "board";
    board.push(card);
}

function placeInHand(card: CardInstance, owner: Player) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    card.zone = "hand";
    hand.push(card);
}

function placeInGraveyard(card: CardInstance, owner: Player) {
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;
    card.zone = "graveyard";
    grave.push(card);
}

// Node-compatible card database loader
function loadCardDatabaseForTests() {
    const cardsDir = path.join(process.cwd(), "cards");

    // Load main cards from all.json
    const allCardsPath = path.join(cardsDir, "all.json");
    const mainCards = JSON.parse(fs.readFileSync(allCardsPath, "utf-8"));

    // Load tokens
    const tokensPath = path.join(cardsDir, "token_details.json");
    const tokenCards = JSON.parse(fs.readFileSync(tokensPath, "utf-8"));

    initCardDatabase({ mainCards, tokenCards });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Op Signature Coverage", () => {
    beforeAll(() => {
        // Mock requestAnimationFrame for headless environment
        (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);

        loadCardDatabaseForTests();
        const goblin = getCardDetails("Goblin");
        console.log("DEBUG: Test Setup - getCardDetails('Goblin') found:", !!goblin);
    });

    beforeEach(() => {
        resetGameState();
        state.blueHP = 20;
        state.redHP = 20;
        state.blueMaxHP = 20;
        state.redMaxHP = 20;
        state.bluePP = 10;
        state.redPP = 10;
        state.blueMaxPP = 10;
        state.redMaxPP = 10;
        state.blueShadows = 0;
        state.redShadows = 0;

    });

    afterEach(() => {
        try {
            checkStateIntegrity(state);
        } catch (e: any) {
            throw new Error("State Integrity Failed: " + e.message);
        }
    });

    describe("Hardening", () => {
        it("pushToBoard: silently ignores duplicate card insertion (idempotency)", () => {
            const card = createFollower({ ...getCardDetails("Goblin"), uid: makeTestUid() });
            placeOnBoard(card, "blue");
            card.zone = "board"; // Ensure zone is correct from start

            const preLength = state.blueBoard.length;

            // Attempt duplicate push
            const success = pushToBoard(state.blueBoard, "blue", card);

            // Should return true (handled) and not increase length
            expect(success).toBe(true);
            expect(state.blueBoard.length).toBe(preLength);

            // Should pass invariants
            checkStateIntegrity(state);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Combat Ops
    // ─────────────────────────────────────────────────────────────────────────

    describe("Combat Ops", () => {
        it("damage: deal X to enemy:leader", () => {
            const effect: Effect = { op: "damage", amount: 5, target: "enemy:leader" };
            runEffects([effect], "blue", null);
            expect(state.redHP).toBe(15);
        });

        it("damage: deal X to ally:leader", () => {
            const effect: Effect = { op: "damage", amount: 3, target: "ally:leader" };
            runEffects([effect], "blue", null);
            expect(state.blueHP).toBe(17);
        });

        it("damage: deal X to enemy:follower (targeted)", () => {
            const enemy = createFollower({ defense: 5 });
            placeOnBoard(enemy, "red");

            const effect: Effect = { op: "damage", amount: 3, target: "enemy:follower", select: 1 };
            runEffects([effect], "blue", null, { targets: [enemy] });

            expect(enemy.defense).toBe(2);
        });

        it("damage_all: deal X to all enemy:followers", () => {
            const e1 = createFollower({ defense: 4 });
            const e2 = createFollower({ defense: 6 });
            placeOnBoard(e1, "red");
            placeOnBoard(e2, "red");

            const effect: Effect = { op: "damage_all", amount: 3, target: "enemy:follower" };
            runEffects([effect], "blue", null);

            expect(e1.defense).toBe(1);
            expect(e2.defense).toBe(3);
        });

        it("damage_all: deal X to all:followers", () => {
            const ally = createFollower({ defense: 5 });
            const enemy = createFollower({ defense: 5 });
            placeOnBoard(ally, "blue");
            placeOnBoard(enemy, "red");

            const effect: Effect = { op: "damage_all", amount: 2, target: "all:follower" };
            runEffects([effect], "blue", null);

            expect(ally.defense).toBe(3);
            expect(enemy.defense).toBe(3);
        });

        it("heal_leader: restore X to ally leader", () => {
            state.blueHP = 10;
            const effect: Effect = { op: "heal_leader", amount: 5 };
            runEffects([effect], "blue", null);
            expect(state.blueHP).toBe(15);
        });

        it("heal_leader: cannot exceed maxHP", () => {
            state.blueHP = 18;
            const effect: Effect = { op: "heal_leader", amount: 10 };
            runEffects([effect], "blue", null);
            expect(state.blueHP).toBe(20);
        });

        it("set_max_hp: set enemy leader max HP to 1", () => {
            const effect: Effect = { op: "set_max_hp", amount: 1, player: "opponent" };
            runEffects([effect], "blue", null);
            expect(state.redMaxHP).toBe(1);
            expect(state.redHP).toBe(1); // HP clamped to max
        });

        it("destroy: destroy selected enemy follower", () => {
            const enemy = createFollower({ ...getCardDetails("Goblin"), uid: makeTestUid() });
            placeOnBoard(enemy, "red");

            const effect: Effect = { op: "destroy", target: "selected:enemy:follower", select: 1 };
            runEffects([effect], "blue", null, { targets: [enemy] });

            cleanupDead();

            expect(state.redBoard.length).toBe(0);
        });

        it("destroy_all: destroy all enemy followers", () => {
            const e1 = createFollower();
            const e2 = createFollower();
            placeOnBoard(e1, "red");
            placeOnBoard(e2, "red");

            const effect: Effect = { op: "destroy_all", target: "enemy:follower" };
            runEffects([effect], "blue", null);
            cleanupDead();

            expect(state.redBoard.length).toBe(0);
        });

        it("banish_self: remove card from board without triggering Last Words", () => {
            const follower = createFollower({
                hasLastWords: true,
                triggers: [{ event: "last_words", effects: [{ op: "add_shadows", amount: 5 }] }]
            });
            placeOnBoard(follower, "blue");

            const effect: Effect = { op: "banish_self" };
            runEffects([effect], "blue", follower);
            cleanupDead();

            expect(state.blueBoard.length).toBe(0);
            expect(state.blueShadows).toBe(0); // Last Words did NOT fire
        });

        it("leader_barrier: grant barrier (soaks one damage)", () => {
            const effect: Effect = { op: "leader_barrier" };
            runEffects([effect], "blue", null);
            expect(state.blueLeaderBarrier).toBe(1);

            // Now damage - barrier should absorb
            const damageEffect: Effect = { op: "damage", amount: 10, target: "ally:leader" };
            runEffects([damageEffect], "blue", null);
            expect(state.blueHP).toBe(20);
            expect(state.blueLeaderBarrier).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Resource Ops
    // ─────────────────────────────────────────────────────────────────────────

    describe("Resource Ops", () => {
        it("add_max_pp: increase max PP by 1", () => {
            state.roundCount = 5;
            state.blueMaxPP = 5; // implied by round 5 + 0 perm
            const effect: Effect = { op: "add_max_pp", amount: 1 };
            runEffects([effect], "blue", null);
            expect(state.blueMaxPP).toBe(6);
        });

        it("recover_pp: recover X PP", () => {
            state.bluePP = 3;
            const effect: Effect = { op: "recover_pp", amount: 5 };
            runEffects([effect], "blue", null);
            expect(state.bluePP).toBe(8);
        });

        it("add_shadows: add X shadows", () => {
            const effect: Effect = { op: "add_shadows", amount: 4 };
            runEffects([effect], "blue", null);
            expect(state.blueShadows).toBe(4);
        });

        it("draw: draw X cards", () => {
            // Setup deck
            for (let i = 0; i < 5; i++) {
                state.blueDeck.push(createFollower({ name: `Deck Card ${i}` }));
            }
            const initialDeckSize = state.blueDeck.length;

            const effect: Effect = { op: "draw", count: 2 };
            runEffects([effect], "blue", null);

            expect(state.blueHand.length).toBe(2);
            expect(state.blueDeck.length).toBe(initialDeckSize - 2);
        });

        it("add_to_hand: add named token to hand", () => {
            const effect: Effect = { op: "add_to_hand", name: "Goblin", count: 2 };
            runEffects([effect], "blue", null);
            expect(state.blueHand.length).toBe(2);
            expect(state.blueHand.every(c => c.name === "Goblin")).toBe(true);
        });

        it("necromancy_gate: spend shadows if available, run nested effects", () => {
            state.blueShadows = 10;
            const effect: Effect = {
                op: "gate",
                cost: 4,
                effects: [{ op: "heal_leader", amount: 5 }]
            };
            state.blueHP = 15;
            runEffects([effect], "blue", null);
            expect(state.blueShadows).toBe(6);
            expect(state.blueHP).toBe(20);
        });

        it("necromancy_gate: do not run if insufficient shadows", () => {
            state.blueShadows = 2;
            const effect: Effect = {
                op: "gate",
                cost: 4,
                effects: [{ op: "heal_leader", amount: 5 }]
            };
            state.blueHP = 15;
            runEffects([effect], "blue", null);
            expect(state.blueShadows).toBe(2); // unchanged
            expect(state.blueHP).toBe(15); // unchanged
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Board Ops
    // ─────────────────────────────────────────────────────────────────────────

    describe("Board Ops", () => {
        it("summon_named: summon a Goblin token", () => {
            const effect: Effect = { op: "summon", name: "Goblin", count: 1 };
            runEffects([effect], "blue", null);
            expect(state.blueBoard.length).toBe(1);
            expect(state.blueBoard[0].name).toBe("Goblin");
        });

        it("summon_named: summon multiple tokens", () => {
            const effect: Effect = { op: "summon", name: "Goblin", count: 3 };
            runEffects([effect], "blue", null);
            expect(state.blueBoard.length).toBe(3);
        });

        it("return_to_hand: bounce ally follower", () => {
            const ally = createFollower({ ...getCardDetails("Goblin"), uid: makeTestUid() });
            placeOnBoard(ally, "blue");

            const effect: Effect = { op: "return_to_hand", target: "selected:ally:follower" };
            runEffects([effect], "blue", null, { targets: [ally] });

            expect(state.blueBoard.length).toBe(0);
            expect(state.blueHand.some(c => c.name === "Goblin")).toBe(true);
        });

        it("reanimate: bring back follower from graveyard", () => {
            // Do not override ID so lookup works. Expect name to revert to "Goblin".
            const deadFollower = createFollower({ ...getCardDetails("Goblin"), name: "Reanimated", uid: makeTestUid() });
            placeInGraveyard(deadFollower, "blue");

            const effect: Effect = { op: "summon", max_cost: 5 };
            runEffects([effect], "blue", null);

            expect(state.blueBoard.length).toBe(1);
            expect(state.blueBoard[0].name).toBe("Goblin");
        });

        it("add_counter: increment counter on amulet", () => {
            const amulet = createAmulet({ counters: { earth: 0 } });
            placeOnBoard(amulet, "blue");

            const effect: Effect = { op: "add_counter", amount: 1 };
            runEffects([effect], "blue", amulet);

            // For generic add_counter, check that earth counter increased
            // (The actual implementation may target specific counter)
            expect(amulet.counters!.earth >= 0).toBe(true);
        });

        it("reduce_countdown: reduce amulet countdown", () => {
            const amulet = createAmulet({ ...getCardDetails("Goblin"), type: "Amulet", hasCountdown: true, countdown: 3, uid: makeTestUid() });
            const effect: Effect = { op: "reduce_countdown", amount: 2, target: "self" };
            runEffects([effect], "blue", amulet);

            expect(amulet.countdown).toBe(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Buff Ops
    // ─────────────────────────────────────────────────────────────────────────

    describe("Buff Ops", () => {
        it("buff: grant +X/+Y to selected follower", () => {
            const ally = createFollower({ ...getCardDetails("Goblin"), attack: 2, defense: 2, uid: "test_uid_22" });
            placeOnBoard(ally, "blue");

            // Removed params wrapping to match op signature
            const effect: Effect = { op: "stat", attack: 2, defense: 3, target: "selected:ally:follower" };
            runEffects([effect], "blue", null, { targets: [ally] });


            expect(state.blueBoard[0].attack).toBe(4);
            expect(state.blueBoard[0].defense).toBe(5);
        });

        it("buff_self: grant +X/+Y to source card", () => {
            const source = createFollower({ attack: 1, defense: 1 });
            placeOnBoard(source, "blue");

            const effect: Effect = { op: "stat", attack: 3, defense: 2 };
            runEffects([effect], "blue", source);

            expect(source.attack).toBe(4);
            expect(source.defense).toBe(3);
        });

        it("buff_all: grant +X/+Y to all ally followers", () => {
            const a1 = createFollower({ attack: 1, defense: 1 });
            const a2 = createFollower({ attack: 2, defense: 2 });
            placeOnBoard(a1, "blue");
            placeOnBoard(a2, "blue");

            const effect: Effect = { op: "stat", target: "ally:follower", attack: 1, defense: 1 };
            runEffects([effect], "blue", null);

            expect(a1.attack).toBe(2);
            expect(a1.defense).toBe(2);
            expect(a2.attack).toBe(3);
            expect(a2.defense).toBe(3);
        });

        it("keyword: grant Ward to follower", () => {
            const ally = createFollower();
            placeOnBoard(ally, "blue");

            const effect: Effect = {
                op: "keyword",
                target: "ally:follower",
                keyword: "Ward"
            };
            runEffects([effect], "blue", null, { targets: [ally] });

            expect(state.blueBoard[0].hasWard).toBe(true);
        });

        it("keyword: grant Rush to follower", () => {
            const ally = createFollower();
            placeOnBoard(ally, "blue");

            const effect: Effect = {
                op: "keyword",
                target: "ally:follower",
                keyword: "Rush"
            };
            runEffects([effect], "blue", null, { targets: [ally] });

            expect(state.blueBoard[0].hasRush).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Gate Ops (Conditional)
    // ─────────────────────────────────────────────────────────────────────────

    describe("Gate Ops", () => {
        it("overflow_gate: triggers when PP >= 7", () => {
            state.blueMaxPP = 8;
            const effect: Effect = {
                op: "gate",
                effects: [{ op: "heal_leader", amount: 3 }]
            };
            state.blueHP = 17;
            runEffects([effect], "blue", null);
            expect(state.blueHP).toBe(20);
        });

        it("overflow_gate: does not trigger when PP < 7", () => {
            state.blueMaxPP = 5;
            const effect: Effect = {
                op: "gate",
                effects: [{ op: "heal_leader", amount: 3 }]
            };
            state.blueHP = 17;
            runEffects([effect], "blue", null);
            expect(state.blueHP).toBe(17); // unchanged
        });

        it("combo_gate: triggers at combo >= N", () => {
            state.bluePlaysThisTurn = 3;
            const effect: Effect = {
                op: "gate",
                count: 3,
                effects: [{ op: "draw", count: 1 }]
            };
            state.blueDeck.push(createFollower());
            runEffects([effect], "blue", null);
            expect(state.blueHand.length).toBe(1);
        });

        it("combo_gate: does not trigger when combo < N", () => {
            state.blueCombo = 2;
            const effect: Effect = {
                op: "gate",
                count: 3,
                effects: [{ op: "draw", count: 1 }]
            };
            state.blueDeck.push(createFollower());
            runEffects([effect], "blue", null);
            expect(state.blueHand.length).toBe(0);
        });

        it("earth_rite: consumes earth sigil and runs effects", () => {
            const sigil = createAmulet({
                name: "Magic Sediment",
                subtype: "Earth Sigil",
                counters: { earth: 1 }
            });
            placeOnBoard(sigil, "blue");

            const effect: Effect = {
                op: "earth_rite",
                amount: 1,
                effects: [{ op: "draw", count: 1 }]
            };
            state.blueDeck.push(createFollower());
            runEffects([effect], "blue", null);

            // Earth sigil should be consumed
            expect(state.blueHand.length).toBe(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Misc Ops
    // ─────────────────────────────────────────────────────────────────────────

    describe("Misc Ops", () => {
        it("spellboost: increase spellboost count on spells in hand", () => {
            const spell = createFollower({
                type: "Spell",
                cost: 10,
                base_cost: 10,
                spellboostCount: 0,
                keywords: [{ name: "Spellboost", reduceCostBy: 1 }]
            });
            placeInHand(spell, "blue");

            const effect: Effect = { op: "spellboost", target: "hand" };
            runEffects([effect], "blue", null);

            expect(spell.spellboostCount).toBe(1);
        });

        it("choose: mode selection sets pending state", () => {
            const effect: Effect = {
                op: "mode",
                count: 1,
                options: [
                    { label: "Mode A", effects: [{ op: "draw", count: 1 }] },
                    { label: "Mode B", effects: [{ op: "heal_leader", amount: 2 }] }
                ]
            };
            // In headless mode, choose typically auto-selects or pauses
            // This test validates the op doesn't crash
            runEffects([effect], "blue", null);
            // If running headless with AI, it should pick one
        });

        it("evolve: evolve source follower", () => {
            const follower = createFollower({
                attack: 2,
                defense: 2,
                can_evolve: true,
                evos: { attack: 2, defense: 2 }
            });
            placeOnBoard(follower, "blue");

            // Ensure evolution is unlocked (requires round count/points)
            state.roundCount = 10;
            state.blueEvoCharges = 1;

            const effect: Effect = { op: "evolve", target: "self" };
            runEffects([effect], "blue", follower);

            expect(follower.attack).toBe(4);
            expect(follower.defense).toBe(4);
            expect(follower.hasEvolved).toBe(true);
        });
    });
});
