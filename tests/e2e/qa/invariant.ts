import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { awaitMotionSettled } from "./awaitMotion.js";

export interface ConsoleTracker {
  errors: string[];
}

/** Dev-guard from fuse finalize on legacy main (engine contract fix is on ui-overhaul). */
const MAIN_KNOWN_CONSOLE_ERRORS = [
  "Targeted op handler illegally invoked lifecycle function: clearSelectableFlags",
];

export function trackConsole(page: Page): ConsoleTracker {
  const tracker: ConsoleTracker = { errors: [] };
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (MAIN_KNOWN_CONSOLE_ERRORS.some((k) => text.includes(k))) return;
    tracker.errors.push(text);
  });
  page.on("pageerror", (err) => {
    const text = String(err);
    if (MAIN_KNOWN_CONSOLE_ERRORS.some((k) => text.includes(k))) return;
    tracker.errors.push(text);
  });
  return tracker;
}

export function assertConsoleClean(tracker: ConsoleTracker): void {
  expect(
    tracker.errors,
    `console errors: ${tracker.errors.join("; ")}`,
  ).toEqual([]);
}

export async function qaStep(
  page: Page,
  tracker: ConsoleTracker,
  action: () => Promise<void>,
  label?: string,
): Promise<void> {
  if (label)
    await page.screenshot({
      path: `test-results/qa/steps/${label}.png`,
      fullPage: true,
    });
  await action();
  await awaitMotionSettled(page);
  await verifyDomMatchesState(page);
  assertConsoleClean(tracker);
}

export async function verifyDomMatchesState(page: Page): Promise<void> {
  const mismatches = await page.evaluate(() => {
    const out: string[] = [];
    const st = (window as any).gameState;
    if (!st) return ["gameState missing on window"];

    const readUids = (zoneId: string) =>
      Array.from(document.querySelectorAll(`#${zoneId} .card`))
        .map((el) => (el as HTMLElement).dataset.uid)
        .filter(Boolean) as string[];

    const boardUids = (player: "first" | "second") => {
      const zone = player === "first" ? "blueBoard" : "redBoard";
      const engine = st.players[player].board.map(
        (c: { uid: string }) => c.uid,
      );
      const dom = readUids(zone);
      if (engine.join("|") !== dom.join("|")) {
        out.push(`${zone} uid order: engine=[${engine}] dom=[${dom}]`);
      }
      return { engine, dom, zone };
    };

    const handCount = (player: "first" | "second") => {
      const countId = player === "first" ? "blueHandCount" : "redHandCount";
      const el = document.getElementById(countId);
      const shown = Number(el?.textContent ?? -1);
      const actual = st.players[player].hand.length;
      if (shown !== actual)
        out.push(`${countId}: shown=${shown} engine=${actual}`);
    };

    const leaderHp = (player: "first" | "second") => {
      const id = player === "first" ? "blueHP" : "redHP";
      const el = document.getElementById(id);
      const shown = Number(el?.textContent ?? -1);
      const actual = st.players[player].hp;
      if (shown !== actual) out.push(`${id}: shown=${shown} engine=${actual}`);
    };

    const pp = (player: "first" | "second") => {
      const id = player === "first" ? "bluePP" : "redPP";
      const el = document.getElementById(id);
      const text = el?.textContent ?? "";
      const actual = `${st.players[player].pp}/${st.players[player].maxPP}`;
      if (text !== actual) out.push(`${id}: shown=${text} engine=${actual}`);
    };

    const shadows = (player: "first" | "second") => {
      const id = player === "first" ? "blueShadows" : "redShadows";
      const el = document.getElementById(id);
      const shown = Number(el?.textContent ?? -1);
      const actual = st.players[player].shadows;
      if (shown !== actual) out.push(`${id}: shown=${shown} engine=${actual}`);
    };

    const cardStats = (
      zoneId: string,
      cards: {
        uid: string;
        type: string;
        attack?: number;
        defense?: number;
        cost?: number;
        countdown?: number;
      }[],
    ) => {
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i]!;
        const el = document.querySelector(
          `#${zoneId} .card[data-uid="${c.uid}"]`,
        ) as HTMLElement | null;
        if (!el) {
          out.push(`${zoneId} missing card uid=${c.uid}`);
          continue;
        }
        const costEl = el.querySelector(".card-stats.top-left");
        if (costEl && c.cost != null && costEl.textContent !== String(c.cost)) {
          out.push(`${c.uid} cost dom=${costEl.textContent} engine=${c.cost}`);
        }
        if (c.type === "Follower") {
          const atk = el.querySelector(".card-stats.bottom-left");
          const def = el.querySelector(".card-stats.bottom-right");
          if (atk && c.attack != null && atk.textContent !== String(c.attack)) {
            out.push(`${c.uid} atk dom=${atk.textContent} engine=${c.attack}`);
          }
          if (
            def &&
            c.defense != null &&
            def.textContent !== String(c.defense)
          ) {
            out.push(`${c.uid} def dom=${def.textContent} engine=${c.defense}`);
          }
        }
        if (c.type === "Amulet" && c.countdown != null) {
          const cd = el.querySelector(".countdown-badge");
          if (cd && cd.textContent !== String(c.countdown)) {
            out.push(
              `${c.uid} countdown dom=${cd.textContent} engine=${c.countdown}`,
            );
          }
        }
      }
    };

    handCount("first");
    handCount("second");
    leaderHp("first");
    leaderHp("second");
    pp("first");
    pp("second");
    shadows("first");
    shadows("second");

    const b1 = boardUids("first");
    const b2 = boardUids("second");
    cardStats("blueBoard", st.players.first.board);
    cardStats("redBoard", st.players.second.board);

    const epText = (btnId: string, charges: number, kind: "Evo" | "Super") => {
      const btn = document.getElementById(btnId);
      const expected =
        kind === "Evo" ? `Evo (${charges})` : `Super (${charges})`;
      if (btn && btn.textContent !== expected) {
        out.push(`${btnId}: shown=${btn.textContent} expected=${expected}`);
      }
    };
    epText("blueNormalEvo", st.players.first.evoCharges ?? 0, "Evo");
    epText("blueSuperEvo", st.players.first.superEvoCharges ?? 0, "Super");
    epText("redNormalEvo", st.players.second.evoCharges ?? 0, "Evo");
    epText("redSuperEvo", st.players.second.superEvoCharges ?? 0, "Super");

    return out;
  });

  expect(mismatches, mismatches.join("\n")).toEqual([]);
}
