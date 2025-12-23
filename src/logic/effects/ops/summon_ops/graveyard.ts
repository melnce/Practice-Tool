import { state } from "../../../../core/gameState.js";

import { Player } from "../../../../core/types.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { summonNamed } from "./direct.js";

export function handleSummonDestroyedAmuletHighestBaseCost(owner: Player) {
  const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;

  // Only amulets that actually hit the graveyard (i.e., were destroyed, not banished/bounced)
  const destroyedAmulets = grave.filter((c) => c?.type === "Amulet");
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
  const choice = candidates[state.rng.nextInt(candidates.length)];
  if (!choice) return;
  const pick = choice.g;

  // Re-create a fresh copy from DB and put it on board using existing API
  summonNamed(
    { op: "summon", source: "named", name: pick.name, count: 1 } as any,
    owner,
  );
}
