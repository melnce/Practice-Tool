import type { Player } from "../../core/types/index.js";
import { runEffects } from "./effects/index.js";

/** Opens the fuse partner picker (shared by logic/index and FUSE player action). */
export function startFuseFromHand(owner: Player, initiatorUid: string): void {
  runEffects(
    [{ op: "fuse", action: "start", initiator_uid: initiatorUid } as any],
    owner,
    null,
  );
}
