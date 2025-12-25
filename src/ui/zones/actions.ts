// src/ui/zones/actions.ts
import { Player, CardInstance } from "../../core/types/index.js";
import { reportError } from "../errors.js";

// Lazy imports for logic
const logic = () => import(/* webpackIgnore: true */ "../../logic/index.js");
const mulliganLogic = () =>
  import(/* webpackIgnore: true */ "../../logic/mulligan.js");
const engageLogic = () =>
  import(/* webpackIgnore: true */ "../../logic/effects/ops/engage.js");

export function handleMulliganToggle(owner: Player, uid: string): void {
  void mulliganLogic()
    .then(({ toggleMulliganPick }) => {
      toggleMulliganPick(owner, uid);
    })
    .catch(reportError);
}

export function handleFuse(
  owner: Player,
  uid: string,
  hasFuseRecipes: boolean,
  card: CardInstance,
): void {
  void logic()
    .then(({ startFuseFromHand, runEffects }) => {
      if (hasFuseRecipes) startFuseFromHand(owner, uid);
      else
        runEffects(
          [{ op: "fuse", type: "fortifier", initiator_uid: uid }],
          owner,
          card,
        );
    })
    .catch(reportError);
}

export function handleResolveTarget(uid: string): void {
  void logic()
    .then(({ resolvePendingTarget }) => resolvePendingTarget(uid))
    .catch(reportError);
}

export function handleEngage(owner: Player, index: number): void {
  void engageLogic()
    .then(({ engageAmulet }) => engageAmulet(owner, index))
    .catch(reportError);
}

export function handlePlayCard(
  handArray: CardInstance[],
  owner: Player,
  index: number,
): void {
  void logic()
    .then(({ playCard }) => playCard(handArray, owner, index))
    .catch(reportError);
}














