import { describe, it, expect, beforeAll } from "vitest";
import { state, resetGameState } from "../../../src/core/gameState";
import { getCardDetails } from "../../../src/data/cardIndex";
import { initCardDatabaseNode } from "../../../src/data/cardLoaderNode";
import * as fs from "fs";

function log(msg: string) {
  fs.appendFileSync("fuse_debug.txt", msg + "\n", "utf8");
}

function createCard(nameOrId: string, owner: "first" | "second") {
  const details = getCardDetails(nameOrId);
  if (!details) throw new Error(`Card not found: ${nameOrId}`);
  const card: any = { ...details };
  card.uid = state.rng.makeUid();
  card.owner = owner;
  if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
  return card;
}

describe("Fuse Selection (Bug Repro)", () => {
  beforeAll(async () => {
    fs.writeFileSync("fuse_debug.txt", "=== Fuse Debug ===\n", "utf8");
    await initCardDatabaseNode();
  });

  it("Gear of Ambition should have fuse_recipes", () => {
    resetGameState(1);

    const gear = createCard("Gear of Ambition", "first");
    log(
      `Gear of Ambition: ${JSON.stringify(
        {
          name: gear.name,
          type: gear.type,
          fuse_recipes: gear.fuse_recipes,
          fuse: gear.fuse,
          tribes: gear.tribes,
        },
        null,
        2,
      )}`,
    );

    expect(gear.fuse_recipes).toBeDefined();
    expect(Array.isArray(gear.fuse_recipes)).toBe(true);
    expect(gear.fuse_recipes.length).toBeGreaterThan(0);
  });

  it("should set pendingTargetEffect when starting fuse", async () => {
    resetGameState(1);
    state.isFirstPlayerTurn = true;
    state.players.first.pp = 10;

    // Add 2 Gears to hand
    const gear1 = createCard("Gear of Ambition", "first");
    const gear2 = createCard("Gear of Remembrance", "first");
    state.players.first.hand.push(gear1, gear2);

    log(`Hand before fuse: ${state.players.first.hand.map((c) => c.name).join(", ")}`);
    log(`Gear1 UID: ${gear1.uid}`);
    log(`Gear1 fuse_recipes: ${JSON.stringify(gear1.fuse_recipes)}`);

    // Start fuse process
    const { startFuseFromHand } = await import("../../../src/logic/index");
    startFuseFromHand("first", gear1.uid);

    log(
      `pendingTargetEffect after startFuse: ${JSON.stringify(state.pendingTargetEffect, null, 2)}`,
    );

    // Check if pending target was set
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect?.pool?.length).toBeGreaterThan(0);
  });

  it("should mark pool cards as __uiSelectable", async () => {
    resetGameState(1);
    state.isFirstPlayerTurn = true;
    state.players.first.pp = 10;

    const gear1 = createCard("Gear of Ambition", "first");
    const gear2 = createCard("Gear of Remembrance", "first");
    state.players.first.hand.push(gear1, gear2);

    const { startFuseFromHand } = await import("../../../src/logic/index");
    startFuseFromHand("first", gear1.uid);

    log(
      `Cards __uiSelectable: ${state.players.first.hand.map((c) => `${c.name}: ${!!c.__uiSelectable}`).join(", ")}`,
    );

    // The partner card (gear2) should be selectable
    const selectableCards = state.players.first.hand.filter((c) => c.__uiSelectable);
    log(`Selectable cards: ${selectableCards.map((c) => c.name).join(", ")}`);

    expect(selectableCards.length).toBeGreaterThan(0);
  });

  it("should allow target selection via resolvePendingTarget", async () => {
    resetGameState(1);
    state.isFirstPlayerTurn = true;
    state.players.first.pp = 10;

    const gear1 = createCard("Gear of Ambition", "first");
    const gear2 = createCard("Gear of Remembrance", "first");
    state.players.first.hand.push(gear1, gear2);

    const { startFuseFromHand, resolvePendingTarget } =
      await import("../../../src/logic/index");
    startFuseFromHand("first", gear1.uid);

    log(
      `Pool before select: ${JSON.stringify(state.pendingTargetEffect?.pool?.map((c: any) => c.name))}`,
    );
    log(`Targeting gear2 UID: ${gear2.uid}`);

    // Simulate clicking on gear2
    resolvePendingTarget(gear2.uid);

    log(
      `Targets after select: ${JSON.stringify(state.pendingTargetEffect?.targets?.map((c: any) => c.name || c.uid))}`,
    );
    log(`pendingTargetEffect exists: ${!!state.pendingTargetEffect}`);

    // If requiresConfirmation, pending should still exist with our target added
    // If not requiresConfirmation and selectCount reached, fuse should complete
    // We just want to verify the click was processed
    const pending = state.pendingTargetEffect;
    if (pending) {
      expect(pending.targets?.length).toBeGreaterThan(0);
    } else {
      // Fuse completed immediately
      log("Fuse completed (no pending)");
    }
  });
});






