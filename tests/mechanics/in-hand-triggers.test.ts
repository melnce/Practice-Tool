/**
 * In-hand trigger behaviour — harness findings and Sephie fuse contract.
 * Engine fixes belong in separate PRs; failures here are recorded findings.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  thenBoard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import {
  forceCompleteOrFizzlePendingTarget,
  resolvePendingTarget,
} from "../../src/logic/core/resolveTarget.js";
import { getPP } from "../../src/core/playerHelpers.js";
import { driveCard } from "../../scripts/lib/cardBehaviourDrive.js";
import fs from "fs";
import path from "path";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SEPHIE = "10934110";
const FILLER = "10111310";
const TEST_SUBJECT = "10931110";

function loadPoolCard(id: string) {
  const all = [
    ...JSON.parse(fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8")),
    ...JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
    ),
  ] as { id: string; cant_play?: boolean }[];
  const raw = all.find((c) => c.id === id);
  expect(raw, id).toBeDefined();
  return raw!;
}

function fuseToInitiator(initiatorUid: string, partnerUid: string): void {
  startFuseFromHand("first", initiatorUid);
  resolvePendingTarget(partnerUid);
  if (state.pendingTargetEffect) {
    forceCompleteOrFizzlePendingTarget();
  }
}

function setupFuseTurn(pp: number) {
  givenGameState({ seed: 42, activePlayer: "first", roundCount: 8 })
    .withFirstPP(pp, 10)
    .withFirstHand([SEPHIE, FILLER])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function countTestSubjects(): number {
  return thenBoard("first").filter((c) => c.id === TEST_SUBJECT).length;
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("in-hand triggers", () => {
  beforeEach(() => resetUidCounter());

  describe("Sephie, Maven Convict (10934110) — on_fuse in hand", () => {
    const printed =
      "Whenever you Fuse to this card, spend 2 play points to summon an Obsessed Test Subject.";

    it("with 2+ PP: spends exactly 2 PP and summons one Obsessed Test Subject", () => {
      setupFuseTurn(4);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");
      fuseToInitiator(sephie.uid, material.uid);
      expect(sephie.isFused).toBe(true);
      expect(countTestSubjects()).toBe(1);
      expect(getPP(state, "first")).toBe(ppBefore - 2);
      expect(printed).toContain("spend 2 play points");
    });

    it("with 1 PP: gate blocks — no PP spent and no summon", () => {
      setupFuseTurn(1);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");
      fuseToInitiator(sephie.uid, material.uid);
      expect(sephie.isFused).toBe(true);
      expect(countTestSubjects()).toBe(0);
      expect(getPP(state, "first")).toBe(ppBefore);
    });
  });

  it("harness in_hand scenario fingerprints Sephie fuse summon and PP spend", () => {
    const raw = loadPoolCard(SEPHIE);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    const inHand = result.scenarios.find((s) => s.scenario === "in_hand");
    expect(inHand).toBeDefined();
    const detail = inHand?.detail as Record<string, unknown>;
    const first = (detail?.players as any)?.first;
    expect(first?.pp).toBe(8);
    expect((first?.board as any[])?.some((c) => c.id === TEST_SUBJECT)).toBe(
      true,
    );
  });

  it("harness in_hand scenario fingerprints Unfeeling Eld Axe cost reduction", () => {
    const raw = loadPoolCard("10673310");
    const result = driveCard(raw);
    const inHand = result.scenarios.find((s) => s.scenario === "in_hand");
    expect(inHand).toBeDefined();
    const hand = ((inHand?.detail as any)?.players?.first?.hand as any[]) ?? [];
    const axe = hand.find((c) => c.id === "10673310");
    expect(axe?.cost_acc).toBe(-1);
  });

  it("harness in_hand scenario fingerprints Annihilating Onslaught EOT cost reduction", () => {
    const raw = loadPoolCard("90014320");
    const result = driveCard(raw, { isToken: true });
    const inHand = result.scenarios.find((s) => s.scenario === "in_hand");
    expect(inHand).toBeDefined();
    const hand = ((inHand?.detail as any)?.players?.first?.hand as any[]) ?? [];
    const spell = hand.find((c) => c.id === "90014320");
    expect(spell?.cost_acc).toBe(-1);
  });
});
