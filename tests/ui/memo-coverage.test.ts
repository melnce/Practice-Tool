/**
 * @vitest-environment jsdom
 * Chrome field → memo invalidation: each field rendered by dom.ts must repaint the same node on in-place mutation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import { renderZone } from "../../src/ui/zones/index.js";
import type { CardInstance } from "../../src/core/types/index.js";

vi.mock("../../src/ui/drag.js", () => ({
  enableBoardDropForOwnSide: vi.fn(),
  wireFieldSlotDragHighlight: vi.fn(),
  enableCardDragFromHand: vi.fn(),
  enableCardEvoDrop: vi.fn(),
  enableAttackerDrag: vi.fn(),
  enableEnemyFollowerDrop: vi.fn(),
}));

vi.mock("../../src/ui/zones/actions.js", () => ({
  handleFuse: vi.fn(),
  handleMulliganToggle: vi.fn(),
  handleResolveTarget: vi.fn(),
  handleEngage: vi.fn(),
  handlePlayCard: vi.fn(),
}));

function boardFollower(uid: string): CardInstance {
  return {
    uid,
    id: "10001110",
    name: "Memo Coverage",
    type: "Follower",
    class: "Forestcraft",
    rarity: "Bronze",
    cost: 3,
    attack: 4,
    defense: 5,
    base_attack: 4,
    base_defense: 5,
    buffs: { attack: 0, defense: 0 },
    owner: "first",
    can_attack: true,
    hasAttacked: false,
    justPlayed: false,
    hasEvolved: false,
    keywords: [],
  } as CardInstance;
}

function handSpell(uid: string): CardInstance {
  return {
    uid,
    id: "20001110",
    name: "Memo Spell",
    type: "Spell",
    class: "Runecraft",
    rarity: "Gold",
    cost: 2,
    cost_mod: 0,
    owner: "first",
    keywords: ["Spellboost"],
    spellboostCount: 0,
  } as CardInstance;
}

function amulet(uid: string): CardInstance {
  return {
    uid,
    id: "30001110",
    name: "Memo Amulet",
    type: "Amulet",
    class: "Havencraft",
    rarity: "Silver",
    cost: 2,
    countdown: 3,
    hasCountdown: true,
    hasEngage: true,
    engageCost: 1,
    engageOncePerTurn: true,
    keywordState: {},
    owner: "first",
  } as CardInstance;
}

type FieldCase = {
  name: string;
  zone: "blueBoard" | "blueHand";
  card: () => CardInstance;
  mutate: (c: CardInstance) => void;
  assertBefore: (root: HTMLElement) => void;
  assertAfter: (root: HTMLElement) => void;
};

const FIELD_CASES: FieldCase[] = [
  {
    name: "cost gem",
    zone: "blueHand",
    card: () => handSpell("h_cost"),
    mutate: (c) => {
      c.cost_mod = -1;
    },
    assertBefore: (root) => {
      expect(root.querySelector(".cost-gem")?.textContent).toBe("2");
    },
    assertAfter: (root) => {
      expect(root.querySelector(".cost-gem")?.textContent).toBe("1");
    },
  },
  {
    name: "countdown chip",
    zone: "blueBoard",
    card: () => amulet("a_cd"),
    mutate: (c) => {
      c.countdown = 1;
    },
    assertBefore: (root) => {
      expect(root.querySelector(".countdown-chip")?.textContent).toBe("3");
    },
    assertAfter: (root) => {
      expect(root.querySelector(".countdown-chip")?.textContent).toBe("1");
    },
  },
  {
    name: "keyword barrier chip",
    zone: "blueBoard",
    card: () => {
      const c = boardFollower("f_kw");
      c.hasBarrier = false;
      return c;
    },
    mutate: (c) => {
      c.hasBarrier = true;
    },
    assertBefore: (root) => {
      expect(root.querySelector('.keyword-chip[data-keyword="barrier"]')).toBeNull();
    },
    assertAfter: (root) => {
      expect(root.querySelector('.keyword-chip[data-keyword="barrier"]')).toBeTruthy();
    },
  },
  {
    name: "evolved flag",
    zone: "blueBoard",
    card: () => boardFollower("f_evo"),
    mutate: (c) => {
      c.hasEvolved = true;
      c.evoType = "normal";
    },
    assertBefore: (root) => {
      expect(root.dataset.evolved).toBeUndefined();
    },
    assertAfter: (root) => {
      expect(root.dataset.evolved).toBe("true");
    },
  },
  {
    name: "super-evolved flag",
    zone: "blueBoard",
    card: () => {
      const c = boardFollower("f_super");
      c.hasEvolved = true;
      c.evoType = "super";
      return c;
    },
    mutate: (c) => {
      c.evoType = "normal";
    },
    assertBefore: (root) => {
      expect(root.dataset.superEvolved).toBe("true");
    },
    assertAfter: (root) => {
      expect(root.dataset.superEvolved).toBeUndefined();
    },
  },
  {
    name: "engage-used flag",
    zone: "blueBoard",
    card: () => amulet("a_eng"),
    mutate: (c) => {
      c.keywordState = { ...(c.keywordState || {}), engagedThisTurn: true };
    },
    assertBefore: (root) => {
      expect(root.dataset.engageUsed).toBeUndefined();
    },
    assertAfter: (root) => {
      expect(root.dataset.engageUsed).toBe("true");
    },
  },
  {
    name: "selection selectable flag",
    zone: "blueBoard",
    card: () => boardFollower("f_sel"),
    mutate: (c) => {
      c.__uiSelectable = true;
    },
    assertBefore: (root) => {
      expect(root.dataset.selectable).toBeUndefined();
    },
    assertAfter: (root) => {
      expect(root.dataset.selectable).toBe("true");
    },
  },
  {
    name: "attack stat plate",
    zone: "blueBoard",
    card: () => boardFollower("f_atk"),
    mutate: (c) => {
      c.attack = 7;
    },
    assertBefore: (root) => {
      expect(root.querySelector('.stat-plate[data-stat="attack"]')?.textContent).toBe("4");
    },
    assertAfter: (root) => {
      expect(root.querySelector('.stat-plate[data-stat="attack"]')?.textContent).toBe("7");
    },
  },
  {
    name: "defense tint",
    zone: "blueBoard",
    card: () => boardFollower("f_def"),
    mutate: (c) => {
      c.defense = 2;
    },
    assertBefore: (root) => {
      const plate = root.querySelector('.stat-plate[data-stat="defense"]') as HTMLElement;
      expect(plate?.dataset.statTint).toBeUndefined();
    },
    assertAfter: (root) => {
      const plate = root.querySelector('.stat-plate[data-stat="defense"]') as HTMLElement;
      expect(plate?.dataset.statTint).toBe("dmg");
    },
  },
  {
    name: "ready flag",
    zone: "blueBoard",
    card: () => boardFollower("f_ready"),
    mutate: (c) => {
      c.hasAttacked = true;
    },
    assertBefore: (root) => {
      expect(root.dataset.ready).toBe("true");
    },
    assertAfter: (root) => {
      expect(root.dataset.ready).toBeUndefined();
    },
  },
  {
    name: "ward flag",
    zone: "blueBoard",
    card: () => {
      const c = boardFollower("f_ward");
      c.hasWard = true;
      return c;
    },
    mutate: (c) => {
      c.hasWard = false;
    },
    assertBefore: (root) => {
      expect(root.dataset.ward).toBe("true");
    },
    assertAfter: (root) => {
      expect(root.dataset.ward).toBeUndefined();
    },
  },
  {
    name: "class accent",
    zone: "blueBoard",
    card: () => boardFollower("f_class"),
    mutate: (c) => {
      c.class = "Dragoncraft";
    },
    assertBefore: (root) => {
      expect(root.dataset.class).toBe("forest");
    },
    assertAfter: (root) => {
      expect(root.dataset.class).toBe("dragon");
    },
  },
];

describe("memo chrome coverage", () => {
  beforeEach(() => {
    resetGameState(4);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.pp = 10;
    document.body.innerHTML = `
      <div id="blueHand" class="zone hand-zone"></div>
      <div id="blueBoard" class="zone board-zone"></div>
    `;
  });

  for (const fc of FIELD_CASES) {
    it(`repaints same node when ${fc.name} changes`, () => {
      const card = fc.card();
      if (fc.zone === "blueHand") {
        state.players.first.hand = [card];
        state.players.first.board = [];
      } else {
        state.players.first.board = [card];
        state.players.first.hand = [];
      }

      const rerender = () => {
        renderZone("blueHand", state.players.first.hand, state, rerender, true);
        renderZone("blueBoard", state.players.first.board, state, rerender);
      };
      rerender();

      const selector =
        fc.zone === "blueHand"
          ? `#blueHand [data-instance-id="${card.uid}"] .card`
          : `#blueBoard [data-instance-id="${card.uid}"]`;
      const el = document.querySelector(selector) as HTMLElement;
      expect(el).toBeTruthy();
      fc.assertBefore(el);

      fc.mutate(card);
      rerender();

      const el2 = document.querySelector(selector) as HTMLElement;
      expect(el2).toBe(el);
      fc.assertAfter(el2);
    });
  }
});
