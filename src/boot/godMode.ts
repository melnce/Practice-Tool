import { wireClick } from "../ui/dom.js";
import { state } from "../core/gameState.js";
import { doAction } from "../core/history.js";

export function initGodMode(): void {
  // God Mode Handlers — target the active player; wrapped for undo
  const godTarget = () => state.players[state.activePlayer];

  wireClick("godPlus", () => {
    doAction(
      "God Mode: +PP",
      () => {
        const p = godTarget();
        p.pp = Math.min(p.maxPP, p.pp + 1);
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godMinus", () => {
    doAction(
      "God Mode: -PP",
      () => {
        const p = godTarget();
        p.pp = Math.max(0, p.pp - 1);
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godRefill", () => {
    doAction(
      "God Mode: Refill PP",
      () => {
        const p = godTarget();
        p.pp = p.maxPP;
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godSetMax", () => {
    const val = prompt("Set Max PP (and fill):", "10");
    if (val) {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) {
        doAction(
          "God Mode: Set Max PP",
          () => {
            const p = godTarget();
            p.maxPP = n;
            p.pp = n;
          },
          {},
          { autoRender: true },
        );
      }
    }
  });

  // God Mode: EP — Worlds Beyond gives both players 2 EP (bible §163)
  wireClick("godEPPlus", () => {
    doAction(
      "God Mode: +EP",
      () => {
        const p = godTarget();
        p.evoCharges = (p.evoCharges || 0) + 1;
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godEPMinus", () => {
    doAction(
      "God Mode: -EP",
      () => {
        const p = godTarget();
        p.evoCharges = Math.max(0, (p.evoCharges || 0) - 1);
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godEPRefill", () => {
    doAction(
      "God Mode: Refill EP",
      () => {
        // Worlds Beyond: both players have 2 EP (not 3).
        godTarget().evoCharges = 2;
      },
      {},
      { autoRender: true },
    );
  });

  wireClick("godSetEvoCount", () => {
    const inp = document.getElementById("godEvoCountVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val)) {
        const slot = state.activePlayer;
        const oldVal = state.players[slot].evoCount || 0;
        const delta = val - oldVal;
        if (delta > 0) {
          // Resolve async import before opening the action (same rule as evolve)
          void import("../logic/effects/skybound.js").then(
            ({ incrementSkyboundArt }) => {
              doAction(
                "God Mode: Set Evo Count",
                () => {
                  state.players[slot].evoCount = val;
                  for (let i = 0; i < delta; i++) {
                    incrementSkyboundArt(slot);
                  }
                },
                {},
                { autoRender: true },
              );
            },
          );
        } else {
          doAction(
            "God Mode: Set Evo Count",
            () => {
              state.players[slot].evoCount = val;
            },
            {},
            { autoRender: true },
          );
        }
      }
    }
  });

  wireClick("godSetComboCount", () => {
    const inp = document.getElementById("godComboCountVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val)) {
        doAction(
          "God Mode: Set Combo",
          () => {
            godTarget().playsThisTurn = val;
          },
          {},
          { autoRender: true },
        );
      }
    }
  });

  wireClick("godSetShadows", () => {
    const inp = document.getElementById("godShadowsVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val) && val >= 0) {
        doAction(
          "God Mode: Set Shadows",
          () => {
            godTarget().shadows = val;
          },
          {},
          { autoRender: true },
        );
      }
    }
  });
}
