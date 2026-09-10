// Derive fuse.partner_pos from cards banished by the fuse (pre-fuse hand positions).

export function banishUidSet(
  banish: readonly { uid: string }[] | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const card of banish ?? []) {
    if (card?.uid) out.add(card.uid);
  }
  return out;
}

/** Pre-fuse hand positions (excluding host) of partners consumed into banish, ascending. */
export function deriveFusePartnerPositions(
  handUidsBefore: readonly string[],
  hostPos: number,
  banishUidsBefore: ReadonlySet<string>,
  banishUidsAfter: ReadonlySet<string>,
): number[] {
  const newlyBanished = new Set<string>();
  for (const uid of banishUidsAfter) {
    if (!banishUidsBefore.has(uid)) newlyBanished.add(uid);
  }

  const positions: number[] = [];
  for (let pos = 0; pos < handUidsBefore.length; pos++) {
    if (pos === hostPos) continue;
    const uid = handUidsBefore[pos];
    if (uid && newlyBanished.has(uid)) positions.push(pos);
  }
  positions.sort((a, b) => a - b);
  return positions;
}
