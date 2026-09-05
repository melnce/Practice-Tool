/**
 * Batch 8 watch items — Resonance absent on Portal inventory; no evolve_trigger_always on Portal cards.
 */
import { describe, it, expect } from "vitest";
import "./setup.js";
import { readFileSync } from "fs";
import { join } from "path";

const PORTAL_IDS = `
10171110 10171120 10171130 10171140 10171310 10171320 10172110 10172120 10172130
10172310 10172320 10173110 10173120 10173130 10173140 10173210 10174110 10174120 10174130
10271110 10271120 10271210 10272110 10272120 10272310 10273110 10273310 10274110 10274120
10371110 10371120 10371310 10372110 10372120 10372210 10373110 10373310 10374110 10374120
10471110 10471120 10471130 10472110 10472120 10472310 10473110 10473310 10474110 10474120
`
  .trim()
  .split(/\s+/);

const SET_FILES = [
  "10001_legends-rise.json",
  "10002_infinity-evolved.json",
  "10003_heirs-of-the-omen.json",
  "10004_skybound-dragons.json",
];

function loadPortalCards() {
  const cards: Array<{
    id: string;
    name: string;
    cost?: string;
    description?: string;
    fanfare?: unknown[];
    evolve_trigger_always?: boolean;
    class?: string;
  }> = [];
  for (const file of SET_FILES) {
    const arr = JSON.parse(
      readFileSync(join(process.cwd(), "cards/sets", file), "utf8"),
    );
    for (const c of arr) {
      if (c.class === "Portalcraft" && PORTAL_IDS.includes(c.id)) cards.push(c);
    }
  }
  return cards;
}

describe("Portal inventory watch — data scan", () => {
  it("no non-basic Portal card uses Resonance or deck-parity gates in description", () => {
    const portal = loadPortalCards();
    expect(portal.length).toBe(49);
    for (const c of portal) {
      const d = String(c.description ?? "").toLowerCase();
      expect(d, c.id).not.toMatch(/resonance/);
      expect(d, c.id).not.toMatch(/deck.*(even|odd)/);
      expect(d, c.id).not.toMatch(/even.*cards.*deck/);
    }
  });

  it("no Portal card in sets 10001–10004 has evolve_trigger_always", () => {
    const portal = loadPortalCards();
    const flagged = portal.filter((c) => c.evolve_trigger_always);
    expect(flagged.map((c) => c.id)).toEqual([]);
  });

  it("10271210 Artifact Catapult — cost 1; Fanfare adds Gear of Ambition and Gear of Remembrance", () => {
    const catapult = loadPortalCards().find((c) => c.id === "10271210")!;
    expect(catapult.cost).toBe("1");
    expect(catapult.description).toContain(
      "Fanfare: Add a Gear of Ambition and a Gear of Remembrance to your hand.",
    );
    expect(catapult.fanfare).toEqual([
      { op: "add_to_hand", name: "Gear of Ambition", count: 1 },
      { op: "add_to_hand", name: "Gear of Remembrance", count: 1 },
    ]);
  });

  it("10274120 Karula, Eternal Arts — cost 5", () => {
    const karula = loadPortalCards().find((c) => c.id === "10274120")!;
    expect(karula.cost).toBe("5");
  });
});
