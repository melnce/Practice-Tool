/**
 * Spell vs Amulet type correctness — text-derived expectations and play-path behavior.
 *
 * Calibration (owner deck screenshot 2026-08-16):
 *   10543310 Sloth of the Crestpetal = Spell
 *   10342210 Nation of Disdain = Amulet
 *
 * Engine play path (mistyped amulet played as spell vanishes to graveyard):
 *   src/logic/core/playCard/core.ts:120-125 — type dispatch
 *   src/logic/core/playCard/spell.ts:42-44 — spell → graveyard
 *   src/logic/core/playCard/amulet.ts:35-37 — amulet → board
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getGraveyard } from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  auditSpellAmuletTypes,
  deriveSpellAmuletType,
} from "../../scripts/lib/typeAudit.js";
import cardsAll from "../../cards/all.json";
import "../../src/logic/core/effects/index.js";

const CALIBRATION: Record<string, "Spell" | "Amulet"> = {
  "10543310": "Spell",
  "10342210": "Amulet",
};

/** dotgg/shadowverse.gg had these as Spell; repo corrected to Amulet (Engage/Countdown). */
const DOTGG_CORRECTED_AMULETS = [
  "10602210", // Encroached World — Engage
  "10001210", // Detective's Lens — Engage
  "10463210", // De La Fille's Gleaming Gems — Engage
  "10903210", // Azvaldt, Penitentiary of Chaos — Last Words / board-persist
  "10963210", // Juratio — Engage
] as const;

function setupTurn(
  round: number,
  opts: { hand?: (string | object)[]; pp?: number } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

describe("Type audit — text-first derivation (225 non-Follower cards)", () => {
  const rows = auditSpellAmuletTypes(
    cardsAll as Parameters<typeof auditSpellAmuletTypes>[0],
  );
  const contradictions = rows.filter((r) => r.contradiction);

  it("scans 225 Spell/Amulet cards with zero text contradictions", () => {
    expect(rows.length).toBe(225);
    expect(contradictions).toEqual([]);
  });

  it("calibration cards match owner-confirmed types", () => {
    for (const [id, expected] of Object.entries(CALIBRATION)) {
      const card = getCardById(id);
      expect(card?.type, id).toBe(expected);
      expect(deriveSpellAmuletType(card!).derived, id).toBe(expected);
    }
  });
});

describe("Type audit — spell resolves to graveyard (not board)", () => {
  beforeEach(() => resetUidCounter());

  it("Sloth of the Crestpetal (10543310) — spell leaves board empty, card in graveyard", () => {
    setupTurn(6, { hand: ["10543310"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first")).toHaveLength(0);
    expect(findOnBoard("first", "Sloth of the Crestpetal")).toBeUndefined();
    expect(getGraveyard(state, "first").some((c) => c.id === "10543310")).toBe(
      true,
    );
  });
});

describe("Type audit — amulet persists on board", () => {
  beforeEach(() => resetUidCounter());

  it("Nation of Disdain (10342210) — amulet stays on board after play", () => {
    setupTurn(6, { hand: ["10342210"], pp: 3 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Nation of Disdain")).toBeDefined();
    expect(getGraveyard(state, "first").some((c) => c.id === "10342210")).toBe(
      false,
    );
  });

  for (const id of DOTGG_CORRECTED_AMULETS) {
    it(`${getCardById(id)?.name} (${id}) — Engage amulet persists on board after play`, () => {
      const card = getCardById(id)!;
      expect(card.type).toBe("Amulet");
      const cost = Number(card.cost) || 1;
      setupTurn(6, { hand: [id], pp: cost });
      whenPlayCard("first", 0);
      expect(findOnBoard("first", card.name)).toBeDefined();
      expect(getGraveyard(state, "first").some((c) => c.id === id)).toBe(false);
    });
  }
});
