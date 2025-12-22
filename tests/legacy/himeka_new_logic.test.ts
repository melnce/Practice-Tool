
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { state } from '../../../src/core/gameState';
import { endTurnBlue, endTurnRed } from '../../../src/logic/core/turns';
import { CardInstance, Player } from '../../../src/core/types';
import { initCardDatabaseNode } from '../../../src/data/cardLoaderNode';
import { getCardDetails } from '../../../src/data/cardIndex';

// Ensure DB is loaded
beforeAll(async () => {
    await initCardDatabaseNode();
});

function create(name: string, owner: Player): CardInstance {
    const details = getCardDetails(name);
    if (!details) throw new Error(`Card not found: ${name}`);
    return {
        ...details,
        uid: Math.random().toString(),
        owner,
        keywordState: {}, // Important for runtime ops
        instanceId: Math.random().toString(),
        can_attack: true
    } as CardInstance;
}

describe('Himeka Crest Logic (JSON Verification)', () => {
    beforeEach(() => {
        state.blueBoard = [];
        state.redBoard = [];
        state.blueCrests = [];
        state.redCrests = [];
        state.turnNumber = 1;
        state.isBlueTurn = true;
        state.activePlayer = 'blue';
        (state as any).blueEvoCount = 0;
        (state as any).redEvoCount = 0;
    });

    it('should correctly extract crest definition from JSON and execute logic', () => {
        // 1. Get Himeka (Follower) to extract Crest definition
        const himekaDetails = getCardDetails("Himeka, Heir to Repose");
        expect(himekaDetails).toBeDefined();

        // Find gain_crest op
        // @ts-ignore
        const fanfare = himekaDetails?.fanfare || [];
        const gainCrestOp = fanfare.find((e: any) => e.op === "gain_crest");
        fs.writeFileSync(path.resolve(__dirname, 'gain_crest_dump.json'), JSON.stringify(gainCrestOp, null, 2));
        expect(gainCrestOp).toBeDefined();

        // 2. Setup Board
        const himeka = create("Himeka, Heir to Repose", "blue");
        state.blueBoard.push(himeka);

        const enemy1 = create("Fairy", "red"); // 1/1
        const enemy2 = create("Fairy", "red");
        state.redBoard.push(enemy1, enemy2);

        // 3. Add Crests based on extracted definition
        // The crest object in state is the propertes of gain_crest op + owner
        const crestObj = {
            ...gainCrestOp,
            owner: 'blue'
        };
        // Add 2 Crests
        state.blueCrests.push(crestObj);
        state.blueCrests.push(crestObj);

        // Verify enemies are clean
        expect(enemy1.keywordState?.cantAttack).toBeFalsy();
        expect(enemy2.keywordState?.cantAttack).toBeFalsy();

        // 4. End Blue Turn -> Triggers Crests
        console.log("DEBUG: Blue Crests Count:", state.blueCrests.length);
        console.log("DEBUG: Red Board Count (Targets):", state.redBoard.length);

        endTurnBlue();

        // Capture State TO FILE
        const debugDump = {
            blueCrestsCount: state.blueCrests.length,
            redBoardCount: state.redBoard.length,
            redBoard: state.redBoard.map(c => ({
                name: c.name,
                uid: c.uid,
                ks: c.keywordState,
                // Triggers
                triggers: c.triggers,
            }))
        };
        try {
            fs.writeFileSync(path.resolve(__dirname, 'himeka_debug_dump.json'), JSON.stringify(debugDump, null, 2));
        } catch (e) {
            console.error("Failed to write debug dump:", e);
        }

        // Verify enemies have cant_attack
        const f1 = state.redBoard.find(c => c.uid === enemy1.uid);
        const f2 = state.redBoard.find(c => c.uid === enemy2.uid);

        console.log("DEBUG: f1 KS:", JSON.stringify(f1?.keywordState, null, 2));
        console.log("DEBUG: f2 KS:", JSON.stringify(f2?.keywordState, null, 2));

        expect(f1?.keywordState?.cantAttack || f1?.keywordState?.cantAttackUntilOpponentEOT).toBeTruthy();
        expect(f2?.keywordState?.cantAttack || f2?.keywordState?.cantAttackUntilOpponentEOT).toBeTruthy();

        // Verify Trigger Grant
        const triggers1 = (f1?.triggers || []).concat(f1?.keywordState?.triggers || []);
        console.log("DEBUG: f1 triggers count:", triggers1.length);

        const banishTrigger1 = triggers1.find(t => t.event === "end_of_turn" && t.effects?.[0]?.op === "banish_self");

        expect(banishTrigger1).toBeDefined();
        expect(banishTrigger1?.condition?.own_turn).toBe(true);

        // 5. Red Turn
        expect(state.isBlueTurn).toBe(false);
        expect(state.activePlayer).toBe("red");

        // End Red Turn -> Should trigger "end_of_turn" on enemies.
        endTurnRed();

        console.log("DEBUG: Red Board Length after Turn:", state.redBoard.length);
        // Verify Banishment
        expect(state.redBoard.length).toBe(0);
    });
});
