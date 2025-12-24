// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("Fediel, Darkness Personified (10454110)", () => {
  it("should have correct Fanfare and Trigger definition", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      __dirname,
      "../../../cards/sets/10004_skybound-dragons.json",
    );

    if (!fs.existsSync(filePath)) throw new Error("JSON not found");

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const cards = JSON.parse(fileContent);

    const card = cards.find((c: any) => c.id === "10454110");
    expect(card).toBeDefined();
    expect(card.name).toBe("Fediel, Darkness Personified");

    // Check Fanfare
    expect(card.fanfare).toBeDefined();
    expect(card.fanfare).toHaveLength(1);

    const necroGate = card.fanfare[0];
    expect(necroGate.op).toBe("gate");
    expect(necroGate.cost).toBe(6);
    expect(necroGate.effects).toHaveLength(2);

    // Reanimate 2 + Evolve
    expect(necroGate.effects[0].op).toBe("summon");
    expect(necroGate.effects[0].max_cost).toBe(2);
    expect(necroGate.effects[0].evolve_summons).toBe(true);

    // Reanimate 1 + Evolve
    expect(necroGate.effects[1].op).toBe("summon");
    expect(necroGate.effects[1].max_cost).toBe(1);
    expect(necroGate.effects[1].evolve_summons).toBe(true);

    // Check Triggers
    expect(card.triggers).toBeDefined();
    expect(card.triggers).toHaveLength(1);

    const eotTrigger = card.triggers[0];
    expect(eotTrigger.type).toBe("end_of_turn_own");
    expect(eotTrigger.effects).toHaveLength(1);

    const debuff = eotTrigger.effects[0];
    expect(debuff.op).toBe("stat");
    expect(debuff.target).toBe("enemy:follower");
    expect(debuff.attack).toBe(-2);
    expect(debuff.defense).toBe(-2);
  });
});






