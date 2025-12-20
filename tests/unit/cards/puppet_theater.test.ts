
// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Puppet Theater (10072210)", () => {
    it("should have correct End of Turn trigger", async () => {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.resolve(__dirname, "../../../cards/sets/10000_basic.json");

        if (!fs.existsSync(filePath)) throw new Error("JSON not found");

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const cards = JSON.parse(fileContent);

        const card = cards.find((c: any) => c.id === "10072210");
        expect(card).toBeDefined();
        expect(card.name).toBe("Puppet Theater");

        // Check Triggers
        expect(card.triggers).toBeDefined();
        expect(card.triggers).toHaveLength(1);

        const trigger = card.triggers[0];
        expect(trigger.type).toBe("end_of_turn_own");
        expect(trigger.source).toBe("board"); // Important for amulets
        expect(trigger.effects).toBeDefined();
        expect(trigger.effects[0].op).toBe("add_to_hand");
        expect(trigger.effects[0].name).toBe("Puppet");
    });
});
