
import type { GameState, CardInstance } from "./types.js";

export interface GameStateValidationResult {
    valid: boolean;
    issues: string[];
}

export function validateGameState(state: GameState): GameStateValidationResult {
    const issues: string[] = [];

    if (!state || typeof state !== "object") {
        return { valid: false, issues: ["State is null or not an object"] };
    }

    // 1. Check critical arrays
    const arrayFields = [
        "blueHand", "redHand",
        "blueBoard", "redBoard",
        "blueDeck", "redDeck",
        "blueGraveyard", "redGraveyard"
    ];

    for (const field of arrayFields) {
        if (!Array.isArray(state[field])) {
            issues.push(`Missing or invalid array: ${field}`);
        } else {
            // Check for nulls/undefined in arrays
            const arr = state[field] as any[];
            for (let i = 0; i < arr.length; i++) {
                if (!arr[i]) {
                    issues.push(`Null/undefined entry in ${field} at index ${i}`);
                }
            }
        }
    }

    // 2. Check Instance ID uniqueness (only across active zones where collision matters most)
    // We'll check hands and boards.
    const activeZones = ["blueHand", "redHand", "blueBoard", "redBoard"];
    const seenIds = new Set<string | number>();

    for (const field of activeZones) {
        if (Array.isArray(state[field])) {
            const arr = state[field] as CardInstance[];
            for (const c of arr) {
                if (c && c.instanceId !== undefined) {
                    if (seenIds.has(c.instanceId)) {
                        issues.push(`Duplicate instanceId ${c.instanceId} found in ${field}`);
                    }
                    seenIds.add(c.instanceId);
                }
            }
        }
    }

    // 3. Check numeric bounds (conservative)
    const nonNegativeFields = [
        "bluePP", "redPP",
        "blueMaxPP", "redMaxPP",
        "blueShadows", "redShadows",
        "blueRally", "redRally",
        "roundCount"
    ];

    for (const field of nonNegativeFields) {
        const val = state[field];
        if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
            issues.push(`Invalid numeric field ${field}: ${val}`);
        }
    }

    // HP can be negative (death), but must be finite number
    if (typeof state.blueHP !== "number" || !Number.isFinite(state.blueHP)) issues.push(`Invalid blueHP: ${state.blueHP}`);
    if (typeof state.redHP !== "number" || !Number.isFinite(state.redHP)) issues.push(`Invalid redHP: ${state.redHP}`);

    return {
        valid: issues.length === 0,
        issues
    };
}

export function assertValidGameState(state: GameState, context: string = ""): void {
    const result = validateGameState(state);
    if (!result.valid) {
        const msg = `Invalid GameState${context ? ` (${context})` : ""}:\n` + result.issues.map(i => `- ${i}`).join("\n");
        throw new Error(msg);
    }
}
