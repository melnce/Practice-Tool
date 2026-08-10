import type { Page, Locator } from "@playwright/test";
import type { RawDeck } from "../../../src/data/rawDeck.js";
import type { Player } from "../../../src/core/types/index.js";

/** Single source of truth for QA selectors — scenarios must not use raw selectors. */
export const SEL = {
  blueHand: "#blueHand",
  redHand: "#redHand",
  blueBoard: "#blueBoard",
  redBoard: "#redBoard",
  blueLeader: "#blueLeader",
  redLeader: "#redLeader",
  blueHP: "#blueHP",
  redHP: "#redHP",
  bluePP: "#bluePP",
  redPP: "#redPP",
  blueHandCount: "#blueHandCount",
  redHandCount: "#redHandCount",
  blueShadows: "#blueShadows",
  redShadows: "#redShadows",
  endTurnBlue: "#endTurnBlue",
  endTurnRed: "#endTurnRed",
  redBoost: "#redBoost",
  blueNormalEvo: "#blueNormalEvo",
  blueSuperEvo: "#blueSuperEvo",
  redNormalEvo: "#redNormalEvo",
  redSuperEvo: "#redSuperEvo",
  blueMulliganConfirm: "#blueMulliganConfirm",
  redMulliganConfirm: "#redMulliganConfirm",
  targetingConfirmation: "#targetingConfirmation",
  choiceModal: "#choiceModal",
  startGameBtn: "#startGameBtn",
  seedInput: "#seedInput",
  cardSelectable: ".card.selectable",
  cardInHand: (zone: "#blueHand" | "#redHand") => `${zone} .card`,
  cardOnBoard: (zone: "#blueBoard" | "#redBoard") => `${zone} .card`,
  handCardByIndex: (zone: "#blueHand" | "#redHand", i: number) => {
    const id = zone.slice(1);
    return `#${id}-${i}`;
  },
  boardCardByIndex: (zone: "#blueBoard" | "#redBoard", i: number) =>
    `${zone} .card:nth-child(${i + 1})`,
} as const;

export class SvwbPage {
  constructor(readonly page: Page) {}

  async gotoTestMode(path = "/?test=1"): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForFunction(() => !!(window as any).__svwbTest);
  }

  async loadDb(): Promise<void> {
    await this.page.evaluate(async () => {
      const { loadCardDatabase } = await import("/src/data/cardDatabase.ts");
      await loadCardDatabase();
    });
  }

  async seedRng(seed: number): Promise<void> {
    await this.page.evaluate((s) => window.__svwbTest!.seedRng(s), seed);
  }

  async loadDecks(
    blue: RawDeck,
    red: RawDeck,
    drawOpening = false,
  ): Promise<void> {
    await this.page.evaluate(
      ([b, r, draw]) =>
        window.__svwbTest!.loadDecks(b, r, { drawOpening: draw }),
      [blue, red, drawOpening] as const,
    );
  }

  async startGameFull(
    seed: number,
    blueDeck = "starter_deck",
    redDeck = "starter_deck",
  ): Promise<void> {
    await this.page.selectOption("#blueDeckSelect", blueDeck);
    await this.page.selectOption("#redDeckSelect", redDeck);
    await this.page.locator(SEL.seedInput).fill(String(seed));
    await this.page.locator(SEL.startGameBtn).click();
    await this.page.waitForFunction(() => {
      const s = (window as any).gameState;
      return s?.phase === "mulligan" || s?.gameStarted === true;
    });
  }

  async waitForPendingTarget(timeout = 5_000): Promise<void> {
    await this.page.waitForFunction(
      () => !!window.__svwbTest!.getState().pendingTargetEffect,
      undefined,
      { timeout },
    );
  }

  async dragHandCardThenClick(
    zone: "#blueHand" | "#redHand",
    index = 0,
  ): Promise<void> {
    const card = this.page.locator(SEL.handCardByIndex(zone, index));
    const box = await card.boundingBox();
    if (!box) throw new Error("hand card not visible for drag-then-click");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down();
    await this.page.mouse.move(cx + 16, cy + 8, { steps: 4 });
    await this.page.mouse.up();
    // Native HTML5 drag may leave the suppressor latched without dragend; complete the gesture.
    await card.evaluate((el) => {
      el.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
    });
    await this.page.waitForTimeout(50);
    await this.leftClickHandCard(zone, index);
  }

  async clickInvalidTargetWhilePending(): Promise<void> {
    await this.page.locator(SEL.blueLeader).click();
  }

  async god(opts: {
    clearHand?: Player[];
    addToHand?: { player: Player; cardId: string; count?: number }[];
    addToDeck?: { player: Player; cardId: string; count?: number }[];
    clearBoard?: Player[];
    clearPending?: boolean;
    summon?: { player: Player; cardId: string; attackReady?: boolean }[];
    setPP?: { player: Player; pp: number; maxPP?: number }[];
    setEP?: { player: Player; charges: number }[];
    setSEP?: { player: Player; charges: number }[];
    setLeaderHP?: { player: Player; hp: number }[];
    resetBonusPP?: boolean;
    advanceToTurn?: { round: number; activePlayer?: Player };
  }): Promise<void> {
    await this.page.evaluate((o) => {
      const t = window.__svwbTest!;
      const s = t.getState();
      const clearUiFlags = () => {
        for (const p of ["first", "second"] as const) {
          for (const c of [...s.players[p].hand, ...s.players[p].board]) {
            delete c.__uiSelectable;
            delete c.__mulliganSelectable;
            delete c.__mulliganSelected;
          }
        }
      };
      if (o.clearPending) {
        s.pendingTargetEffect = null;
        clearUiFlags();
      }
      o.clearHand?.forEach((p) => {
        s.players[p].hand = [];
      });
      o.clearBoard?.forEach((p) => {
        s.players[p].board = [];
      });
      if (o.clearHand || o.clearBoard) {
        s.pendingTargetEffect = null;
        clearUiFlags();
      }
      o.addToHand?.forEach((x) => t.addToHand(x.player, x.cardId, x.count));
      o.addToDeck?.forEach((x) => t.addToDeck(x.player, x.cardId, x.count));
      o.summon?.forEach((x) =>
        t.summonToBoard(x.player, x.cardId, x.attackReady),
      );
      if (o.advanceToTurn)
        t.advanceToTurn(o.advanceToTurn.round, o.advanceToTurn.activePlayer);
      o.setPP?.forEach((x) => t.setPP(x.player, x.pp, x.maxPP));
      o.setEP?.forEach((x) => t.setEP(x.player, x.charges));
      o.setSEP?.forEach((x) => t.setSEP(x.player, x.charges));
      o.setLeaderHP?.forEach((x) => t.setLeaderHP(x.player, x.hp));
      if (o.resetBonusPP) {
        s.secondPlayerPPBoostUsedEarly = false;
        s.secondPlayerPPBoostUsedLate = false;
        s.secondPlayerPPBoostPending = false;
      }
      t.render();
    }, opts);
  }

  async waitForPendingSelectCount(count: number): Promise<void> {
    await this.page.waitForFunction(
      (n) =>
        window.__svwbTest!.getState().pendingTargetEffect?.selectCount === n,
      count,
      { timeout: 10_000 },
    );
  }

  async readState<T>(fn: string): Promise<T> {
    return this.page.evaluate((body) => {
      const st = window.__svwbTest!.getState();
      return new Function("state", `return (${body})`)(st) as T;
    }, fn);
  }

  hand(zone: "#blueHand" | "#redHand"): Locator {
    return this.page.locator(zone);
  }

  board(zone: "#blueBoard" | "#redBoard"): Locator {
    return this.page.locator(zone);
  }

  async rightClickPlayHandCard(
    zone: "#blueHand" | "#redHand",
    index = 0,
  ): Promise<void> {
    const card = this.page.locator(SEL.handCardByIndex(zone, index));
    await card.click({ button: "right", force: true });
    await this.page.waitForTimeout(200);
  }

  async leftClickHandCard(
    zone: "#blueHand" | "#redHand",
    index = 0,
  ): Promise<void> {
    await this.page
      .locator(SEL.handCardByIndex(zone, index))
      .click({ force: true });
    await this.page.waitForTimeout(200);
  }

  async dragHandToBoard(
    handZone: "#blueHand" | "#redHand",
    boardZone: "#blueBoard" | "#redBoard",
    handIndex = 0,
  ): Promise<void> {
    await this.dragLocatorToLocator(
      this.page.locator(SEL.handCardByIndex(handZone, handIndex)),
      this.page.locator(boardZone),
    );
  }

  async dragAttackerToTarget(
    attackerBoard: "#blueBoard" | "#redBoard",
    attackerIndex: number,
    target: Locator,
  ): Promise<void> {
    await this.dragLocatorToLocator(
      this.page.locator(SEL.boardCardByIndex(attackerBoard, attackerIndex)),
      target,
    );
  }

  async dragEvoToFollower(
    evoBtn:
      | "#blueNormalEvo"
      | "#blueSuperEvo"
      | "#redNormalEvo"
      | "#redSuperEvo",
    boardZone: "#blueBoard" | "#redBoard",
    index = 0,
  ): Promise<void> {
    await this.dragLocatorToLocator(
      this.page.locator(evoBtn),
      this.page.locator(SEL.boardCardByIndex(boardZone, index)),
    );
  }

  async clickSelectableBoard(
    zone: "#blueBoard" | "#redBoard",
    nth = 0,
  ): Promise<void> {
    await this.page.locator(`${zone} ${SEL.cardSelectable}`).nth(nth).click();
  }

  async clickSelectableHand(
    zone: "#blueHand" | "#redHand",
    nth = 0,
  ): Promise<void> {
    await this.page
      .locator(`${zone} ${SEL.cardSelectable}`)
      .nth(nth)
      .click({ force: true });
  }

  async fuseWithHandPartner(
    zone: "#blueHand" | "#redHand",
    partnerIndex: number,
  ): Promise<void> {
    const partnerSel = SEL.handCardByIndex(zone, partnerIndex);
    const confirmSel = `${SEL.targetingConfirmation} .confirm-targets-btn`;
    await this.page.waitForFunction(
      ([p, c]) => {
        const el = document.querySelector(p);
        return (
          el?.classList.contains("selectable") || !!document.querySelector(c)
        );
      },
      [partnerSel, confirmSel],
      { timeout: 10_000 },
    );
    const partnerSelectable = await this.page
      .locator(partnerSel)
      .evaluate((el) => el.classList.contains("selectable"));
    if (partnerSelectable) {
      await this.page.locator(partnerSel).click({ force: true });
    }
    const confirm = this.page.locator(confirmSel);
    if (await confirm.isVisible()) {
      await confirm.click();
    }
  }

  async clickLeader(side: "blue" | "red"): Promise<void> {
    await this.page
      .locator(side === "blue" ? SEL.blueLeader : SEL.redLeader)
      .click();
  }

  async engageBoardCard(
    zone: "#blueBoard" | "#redBoard",
    index = 0,
  ): Promise<void> {
    await this.page
      .locator(SEL.boardCardByIndex(zone, index))
      .click({ button: "right" });
  }

  async endTurn(side: "blue" | "red"): Promise<void> {
    await this.page
      .locator(side === "blue" ? SEL.endTurnBlue : SEL.endTurnRed)
      .click();
  }

  async useBonusPP(): Promise<void> {
    await this.page.locator(SEL.redBoost).click();
  }

  async confirmMulligan(side: "blue" | "red"): Promise<void> {
    const id =
      side === "blue" ? SEL.blueMulliganConfirm : SEL.redMulliganConfirm;
    await this.page.locator(id).click();
  }

  async toggleMulliganCard(
    zone: "#blueHand" | "#redHand",
    index: number,
  ): Promise<void> {
    await this.page.locator(SEL.handCardByIndex(zone, index)).click();
  }

  async confirmTargets(): Promise<void> {
    const btn = this.page
      .locator(`${SEL.targetingConfirmation} button`)
      .first();
    if (await btn.isVisible()) await btn.click();
  }

  async pickChoice(index = 0): Promise<void> {
    await this.page.locator(".choice-modal .choice-option").nth(index).click();
  }

  async startGame(
    seed: number,
    deckA = "starter_deck",
    deckB = "starter_deck",
  ): Promise<void> {
    await this.page.locator(SEL.seedInput).fill(String(seed));
    await this.page.locator(SEL.startGameBtn).click();
    await this.page.waitForFunction(() => {
      const s = (window as any).gameState;
      return s?.gameStarted === true;
    });
  }

  private async dragLocatorToLocator(
    source: Locator,
    target: Locator,
  ): Promise<void> {
    const s = await source.boundingBox();
    const t = await target.boundingBox();
    if (!s || !t) throw new Error("drag targets not visible");
    await this.page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, {
      steps: 12,
    });
    await this.page.mouse.up();
  }
}
