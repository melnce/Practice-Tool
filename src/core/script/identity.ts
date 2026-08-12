/**
 * Stable card identity for scripts: catalog `cardId` + occurrence index.
 *
 * Occurrence is counted left-to-right in the given zone among cards whose
 * `id` matches. This survives UID renumbering from engine `makeUid()` churn
 * and is hand-writable ("second Goblin in hand").
 */

import type { CardInstance } from "../types/cards.js";
import type { ScriptCardRef } from "./types.js";
import { ScriptDivergeError } from "./types.js";

export function occurrenceOf(
  zone: readonly CardInstance[],
  uid: string,
): ScriptCardRef | null {
  const card = zone.find((c) => c.uid === uid);
  if (!card || !card.id) return null;
  let occ = 0;
  for (const c of zone) {
    if (c.uid === uid) {
      return { cardId: String(card.id), occ };
    }
    if (String(c.id) === String(card.id)) occ += 1;
  }
  return null;
}

export function resolveCardRef(
  zone: readonly CardInstance[],
  ref: ScriptCardRef,
  label: string,
  stepIndex: number,
  step: unknown,
): CardInstance {
  const wantOcc = ref.occ ?? 0;
  let occ = 0;
  for (const c of zone) {
    if (String(c.id) !== String(ref.cardId)) continue;
    if (occ === wantOcc) return c;
    occ += 1;
  }
  const available = zone
    .map((c, i) => `[${i}] id=${c.id} name=${c.name}`)
    .join(", ");
  throw new ScriptDivergeError(
    stepIndex,
    step as never,
    `${label}: no card id=${ref.cardId} occ=${wantOcc}. Zone: ${available || "(empty)"}`,
  );
}
