import { state } from "../../../../core/gameState.js";

import type { Player } from "../../../../core/types/index.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { summonNamed } from "./direct.js";
import { getGraveyard } from "../../../../core/playerHelpers.js";

export function handleSummonDestroyedAmuletHighestBaseCost(owner: Player) {
  const grave = getGraveyard(state, owner);

  // Owner ruling 2026-09-02 (same provenance as Reanimate): only amulets that
  // were destroyed on the field. destroyedHistory is written at the genuine
  // destruction sites — discarded / Engage-consumed amulets land in the
  // graveyard too but are NOT eligible. Match graveyard entries by uid.
  const destroyedUids = new Set(
    state.players[owner].destroyedHistory.map((r) => String(r.uid ?? "")),
  );
  const destroyedAmulets = grave.filter(
    (c) => c?.type === "Amulet" && destroyedUids.has(String(c.uid ?? "")),
  );
  if (!destroyedAmulets.length) return;

  // Compute base costs from DB (ignores temporary cost mods during play)
  let maxBase = -Infinity;
  const withBase = destroyedAmulets.map((g) => {
    const base = getCardDetails(g.name);
    const baseCost = parseInt(base?.cost as any, 10) || 0;
    if (baseCost > maxBase) maxBase = baseCost;
    return { g, baseCost };
  });

  const candidates = withBase.filter((x) => x.baseCost === maxBase);
  if (!candidates.length) return;

  // Random one among the highest base cost
  const choice = state.rng.pick(candidates);
  if (!choice) return;
  const pick = choice.g;

  // Re-create a fresh copy from DB and put it on board using existing API
  summonNamed(
    { op: "summon", source: "named", name: pick.name, count: 1 } as any,
    owner,
  );
}
