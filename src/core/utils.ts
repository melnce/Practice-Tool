// utils.ts - Combined utility functions

import { state } from "./gameState.js";
import { adapter } from "./adapter.js";
import { logEvent } from "./logger.js";
import { addShadows, getGraveyard } from "./playerHelpers.js";
import { applyGameOverIfNeeded } from "./gameOver.js";
import { fireTrigger } from "../logic/core/triggers.js";
import { bumpZoneVersion } from "../logic/core/triggers/utils.js";
// Pull *once* from rng and re-export locally-used helpers
// (Refactored to use state.rng directly)

// Import types
import type { CardInstance, Player } from "./types/index.js";

// Constants
export const MAX_HAND = 9;
const REAPER_URLS = [
  "https://static.wikia.nocookie.net/shadowverse/images/b/b7/Images.jpg",
  "https://images.wikia.nocookie.net/__cb20220410215837/shadowverse/images/b/b7/Images.jpg",
  // simple skull SVG
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="black"/><circle cx="128" cy="120" r="70" fill="white"/><circle cx="102" cy="110" r="12"/><circle cx="154" cy="110" r="12"/><rect x="118" y="138" width="20" height="38"/></svg>',
];

// ---- RNG helpers (aliases to avoid duplication) ------------------------------
export function randomChoice<T>(arr: T[] | null | undefined): T | null {
  if (!arr || arr.length === 0) return null;
  return state.rng.pick(arr);
}

export function randomInt(max: number): number {
  return state.rng.nextInt(max);
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  const n = arr.length;
  for (let i = n - 1; i > 0; i--) {
    const j = state.rng.nextInt(i + 1);
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr;
}

// -------- Helpers --------
function showImageOverlayWithFallback(urls: string[]) {
  if (typeof document === "undefined") return; // headless: noop
  const box = document.getElementById("burnPreview");
  const img = document.getElementById(
    "burnPreviewImg",
  ) as HTMLImageElement | null;
  if (!box || !img) return;

  let i = 0;
  img.onload = () => {
    box.style.display = "block";
    setTimeout(() => (box.style.display = "none"), 900);
    // clean handlers after success
    img.onload = null;
    img.onerror = null;
  };
  img.onerror = () => {
    i += 1;
    const nextUrl = urls[i];
    if (nextUrl !== undefined) {
      img.src = nextUrl;
    } else {
      // give up silently
      box.style.display = "none";
      img.onerror = null;
      img.onload = null;
    }
  };

  const firstUrl = urls[0];
  if (firstUrl !== undefined) {
    img.src = firstUrl;
  }
}

function burnPreview(card: CardInstance | any) {
  if (typeof document === "undefined") return; // headless: noop
  const box = document.getElementById("burnPreview");
  const img = document.getElementById(
    "burnPreviewImg",
  ) as HTMLImageElement | null;
  if (!box || !img) return;
  img.onload = null;
  img.onerror = null; // no fallback for burns
  (img as any).src = card?.base_image || card?.image || "";
  box.style.display = "block";
  setTimeout(() => (box.style.display = "none"), 900);
}

function isFirstPlayer(owner: Player | null): boolean {
  return owner === "first";
}

/**
 * Hand-overflow burn (§62): card is destroyed into the cemetery as a shadow.
 * Owner ruling: does NOT fire Last Words — treat as a burn, not true destruction.
 * Shared by draw (`pushToHand`) and bounce overflow.
 */
export function burnHandOverflow(
  card: CardInstance | any,
  owner: Player | null,
): void {
  if (!card) return;
  if (owner) {
    card.zone = "graveyard";
    card.owner = owner;
    getGraveyard(state, owner).push(card);
    addShadows(state, owner, 1);
    bumpZoneVersion();
    logEvent("burn_to_grave", {
      owner,
      card: card.name,
      uid: card.uid,
    });
  } else {
    logEvent("burn", { owner: null, card: card?.name });
  }
  burnPreview(card);
}

/** Apply deckout result when a draw is attempted on an empty deck. */
function applyDeckoutLoss(owner: Player): void {
  const isFirst = isFirstPlayer(owner);
  const iHaveCrest = isFirst
    ? (state.players.first.crests || []).some(
        (c) => c.name === "Mjerrabaine, Great Manifest",
      )
    : (state.players.second.crests || []).some(
        (c) => c.name === "Mjerrabaine, Great Manifest",
      );

  const iWinOnDeckout =
    iHaveCrest ||
    (isFirst
      ? !!state.players.first.deckoutWins
      : !!state.players.second.deckoutWins);

  const opp: Player = isFirst ? "second" : "first";

  if (iWinOnDeckout) {
    state.players[opp].defeated = true;
    logEvent("deckout", { loser: opp, winner: owner });
  } else {
    state.players[owner].defeated = true;
    logEvent("deckout", { loser: owner, winner: opp });
  }

  applyGameOverIfNeeded("deckout");
}

export function pushToHand(
  hand: CardInstance[],
  card: CardInstance | any,
): boolean {
  if (!card) return false;
  if (hand.length >= MAX_HAND) {
    let owner: Player | null = null;
    if (hand === state.players.first.hand) owner = "first";
    else if (hand === state.players.second.hand) owner = "second";
    else if (card.owner === "first" || card.owner === "second") {
      owner = card.owner;
    }
    burnHandOverflow(card, owner);
    return false;
  }
  card.zone = "hand";
  hand.push(card);
  bumpZoneVersion();
  return true;
}

/**
 * drawCard(hand, deck, owner?)
 * - If deck empty: instant loss for the drawer + flash Reaper image.
 * - Owner inference keeps old call sites working.
 * @param owner - Player slot (accepts both legacy and new format)
 */
export function drawCard(
  hand: CardInstance[],
  deck: CardInstance[],
  owner: Player | null = null,
): boolean {
  if (!owner) {
    if (hand === state.players.first.hand) owner = "first";
    else if (hand === state.players.second.hand) owner = "second";
  }

  if (!deck || deck.length === 0) {
    if (owner) {
      applyDeckoutLoss(owner);

      if (typeof document !== "undefined") {
        const isFirst = isFirstPlayer(owner);
        const iHaveCrest = isFirst
          ? (state.players.first.crests || []).some(
              (c) => c.name === "Mjerrabaine, Great Manifest",
            )
          : (state.players.second.crests || []).some(
              (c) => c.name === "Mjerrabaine, Great Manifest",
            );

        const overlayImages = iHaveCrest
          ? ["/images/victory_card.png"]
          : REAPER_URLS;
        showImageOverlayWithFallback(overlayImages);
      }

      adapter.render();
    }
    return false;
  }
  // draw from the END of the array (top of deck)
  const top = deck.pop();

  if (top) {
    // Log the normal draw
    logEvent("draw", { owner, card: top.name, uid: top.uid });
  }

  const drawn = pushToHand(hand, top);
  if (drawn && top && owner) {
    if (!state.lastDrawnCards) state.lastDrawnCards = [];
    state.lastDrawnCards.unshift(top);
    if (state.lastDrawnCards.length > 5) state.lastDrawnCards.length = 5;
    (state as any).lastDrawnCard = top;
    fireTrigger("ally_draw", owner, { drawnCard: top, enteringCard: top });
    fireTrigger("when_drawn", owner, {
      sourceCard: top,
      drawnCard: top,
      enteringCard: top,
    });
  }
  return drawn;
}
