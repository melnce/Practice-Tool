import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";

import type {
  CardInstance,
  Effect,
  Player,
} from "../../../../core/types/index.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { makeCardFromDB, pushToBoard } from "./core.js";
import { boardOf, deckOf } from "./utils.js";

export function summonRandomFromDeck(eff: Effect, owner: Player) {
  // Desired number
  let want = parseInt((eff as any)?.count ?? 1);
  if (!Number.isFinite(want) || want <= 0) want = 1;

  const deck = deckOf(owner);
  const board = boardOf(owner);

  // Respect board space
  const space = Math.max(0, 5 - board.length);
  if (space <= 0) return;

  // -------- Filters --------
  const f = (eff as any)?.filters || (eff as any)?.filter || {};
  const wantType = String(f.type ?? "").toLowerCase(); // "amulet" | "follower" | "spell"
  const cls = String(f.class ?? f.class_eq ?? "").toLowerCase();
  const costLte = Number.isFinite(Number(f.cost_lte))
    ? Number(f.cost_lte)
    : null;
  const costGte = Number.isFinite(Number(f.cost_gte))
    ? Number(f.cost_gte)
    : null;
  const costEq = Number.isFinite(Number(f.cost_eq)) ? Number(f.cost_eq) : null;

  const matches = (c: CardInstance) => {
    const t = String(c.type || "").toLowerCase();
    const okType = !wantType || t === wantType;
    const okClass = !cls || String(c.class || "").toLowerCase() === cls;
    const costNum = Number(c.cost);
    const okLte =
      costLte == null || (Number.isFinite(costNum) && costNum <= costLte);
    const okGte =
      costGte == null || (Number.isFinite(costNum) && costNum >= costGte);
    const okEq =
      costEq == null || (Number.isFinite(costNum) && costNum === costEq);
    return okType && okClass && okLte && okGte && okEq;
  };

  // Collect candidates from deck (deck entries have UIDs)
  let candidates = deck.filter(matches);
  if (!candidates.length) return;

  // Optional: enforce differently named results
  if ((eff as any).unique_names) {
    const seen = new Set();
    candidates = candidates.filter((c) => {
      const n = String(c.name || "").toLowerCase();
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }
  if (!candidates.length) return;

  // Shuffle (Fisher–Yates)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = state.rng.nextInt(i + 1);
    // Swap is bounds-safe: i and j are both in [0, candidates.length-1]
    const temp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = temp;
  }

  // Respect board space and requested count
  const take = Math.min(want, space, candidates.length);
  const picks = candidates.slice(0, take);

  if (state.lastSummoned) state.lastSummoned.length = 0;

  // Summon and remove from deck
  for (const deckEntry of picks) {
    const data = getCardDetails(deckEntry.name);
    if (!data) continue;

    const card = makeCardFromDB(data, owner);
    if (!pushToBoard(board, owner, card)) break;

    // remove the specific deck entry (by uid) so duplicates remain intact in deck
    const idx = deck.indexOf(deckEntry);
    if (idx !== -1) deck.splice(idx, 1);

    state.lastSummoned.push(card);
  }

  logEvent("summonRandom", {
    owner,
    picks: state.lastSummoned.map((c) => c.name),
  });
  // Render removed - UI orchestrator handles rendering
}
