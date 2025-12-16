
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock window for cardDatabase if needed
if (typeof window === "undefined") {
    (global as any).window = {};
}

import { state } from "../../../src/core/gameState.js";

describe("Unleashed Card Data", () => {
    it("should have the correct spell effects", async () => {
        const fs = await import("fs");
        const path = await import("path");
        // Try resolving 3 levels up first, falling back to 4 if needed or just logging
        // Actually trust the pattern that worked for Mireille, but log the path.
        const filePath = path.resolve(__dirname, "../../../cards/sets/10004_skybound-dragons.json");
        // console.log("Test looking for JSON at:", filePath);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found at ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const cards = JSON.parse(fileContent);

        const unleashed = cards.find((c: any) => c.id === "10432310");
        console.log("Unleashed found:", unleashed ? "Yes" : "No");
        if (!unleashed) {
            console.log("Available IDs:", cards.slice(0, 5).map((c: any) => c.id));
            throw new Error("Unleashed card not found in JSON");
        }

        expect(unleashed).toBeDefined();
        expect(unleashed.spell).toBeDefined();
        expect(unleashed.spell.length).toBe(1);
        expect(unleashed.spell[0].op).toBe("choose");
        expect(unleashed.spell[0].options.length).toBe(2);

        // Mode 1
        const mode1 = unleashed.spell[0].options[0];
        expect(mode1.effects.length).toBe(2);
        expect(mode1.effects[0].op).toBe("draw");
        expect(mode1.effects[0].count).toBe(1);
        expect(mode1.effects[1].op).toBe("damage_random");
        expect(mode1.effects[1].amount).toBe(4);

        // Mode 2
        const mode2 = unleashed.spell[0].options[1];
        expect(mode2.effects.length).toBe(3);
        expect(mode2.effects[0].op).toBe("draw");
        expect(mode2.effects[0].count).toBe(2);
        expect(mode2.effects[1].op).toBe("damage_random");
        expect(mode2.effects[1].amount).toBe(4);
        expect(mode2.effects[1].count).toBe(2);
        expect(mode2.effects[2].op).toBe("damage");
        expect(mode2.effects[2].target).toBe("ally:leader");
        expect(mode2.effects[2].amount).toBe(2);
    });
});
