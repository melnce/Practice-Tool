// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Ezecrain, Portent of Vengeance Data Verification", () => {
  it("Should have correct Fanfare effects", () => {
    const filePath = path.resolve(
      __dirname,
      "../../../cards/sets/10004_skybound-dragons.json",
    );
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const cards = JSON.parse(fileContent);

    const ezecrain = cards.find((c: any) => c.id === "10432110");
    expect(ezecrain).toBeDefined();
    expect(ezecrain.name).toBe("Ezecrain, Portent of Vengeance");

    // Verify Fanfare
    const fanfare = ezecrain.fanfare;
    expect(fanfare).toBeDefined();
    expect(fanfare.length).toBe(2);

    // Effect 1: Select 2 deal 4
    expect(fanfare[0].op).toBe("select");
    expect(fanfare[0].target).toBe("enemy:follower");
    expect(fanfare[0].count).toBe(2);
    expect(fanfare[0].effects[0].op).toBe("damage");
    expect(fanfare[0].effects[0].amount).toBe(4);

    // Effect 2: Summon Magic Sediment (NOT gain_earth_sigil)
    expect(fanfare[1].op).toBe("summon");
    expect(fanfare[1].name).toBe("Magic Sediment");
    expect(fanfare[1].count).toBe(2);
  });
});






