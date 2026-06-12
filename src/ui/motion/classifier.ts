// src/ui/motion/classifier.ts — pure event → MotionPlan (no DOM, no logger import)

export type EntryKind = "draw" | "summon" | "bounce" | "hand-add" | "generic";
export type ExitKind = "dissolve" | "banish" | "fuse-consume" | "return-deck" | "fade";

export interface MotionEntry {
  uid: string;
  kind: EntryKind;
  fromUid?: string;
  owner?: string;
}

export interface MotionExit {
  uid: string;
  kind: ExitKind;
  initiatorUid?: string;
}

export interface MotionPop {
  kind: "damage" | "heal" | "barrier-ring";
  uid?: string;
  player?: string;
  amount: number;
}

export interface MotionPlan {
  entries: MotionEntry[];
  exits: MotionExit[];
  pops: MotionPop[];
  gap: boolean;
}

export interface LogEntryLike {
  id: number;
  type: string;
  details?: Record<string, unknown>;
}

const SUMMON_TYPES = new Set([
  "summon",
  "reanimateSummon",
  "chainSpawn",
  "summonFromHand",
  "summonExactCopy",
]);

const EXIT_DISSOLVE = new Set(["destroy", "death", "destroyQueued", "destroySelf"]);
const EXIT_BANISH = new Set(["banish", "banishSelf", "banishOnDeath"]);

function uidFromDetails(d: Record<string, unknown>): string | undefined {
  const u =
    d.uid ??
    d.targetUid ??
    d.attackerUid ??
    d.newUid ??
    d.cardUid;
  return typeof u === "string" && u ? u : undefined;
}

export function classify(
  events: LogEntryLike[],
  prevUids: Set<string>,
  nextUids: Set<string>,
): MotionPlan {
  const entries: MotionEntry[] = [];
  const exits: MotionExit[] = [];
  const pops: MotionPop[] = [];
  const claimedEntries = new Set<string>();
  const claimedExits = new Set<string>();
  const bounceOldUids = new Set<string>();

  for (const ev of events) {
    const d = ev.details ?? {};

    if (ev.type === "bounceToHand") {
      const oldUid = typeof d.oldUid === "string" ? d.oldUid : undefined;
      const newUid = typeof d.newUid === "string" ? d.newUid : undefined;
      if (oldUid) bounceOldUids.add(oldUid);
      if (newUid && !claimedEntries.has(newUid)) {
        claimedEntries.add(newUid);
        entries.push({
          uid: newUid,
          kind: "bounce",
          fromUid: oldUid,
          owner: typeof d.from === "string" ? d.from : undefined,
        });
      }
      continue;
    }

    if (ev.type === "draw" && typeof d.uid === "string") {
      if (!claimedEntries.has(d.uid)) {
        claimedEntries.add(d.uid);
        entries.push({
          uid: d.uid,
          kind: "draw",
          owner: typeof d.owner === "string" ? d.owner : undefined,
        });
      }
      continue;
    }

    if (SUMMON_TYPES.has(ev.type) && typeof d.uid === "string") {
      if (!claimedEntries.has(d.uid)) {
        claimedEntries.add(d.uid);
        entries.push({ uid: d.uid, kind: "summon", owner: typeof d.owner === "string" ? d.owner : undefined });
      }
      continue;
    }

    if (ev.type === "add_to_hand" && typeof d.uid === "string") {
      if (!claimedEntries.has(d.uid)) {
        claimedEntries.add(d.uid);
        entries.push({
          uid: d.uid,
          kind: "hand-add",
          owner: typeof d.owner === "string" ? d.owner : undefined,
        });
      }
      continue;
    }

    if (ev.type === "fuseConsume") {
      const initiatorUid =
        typeof d.initiatorUid === "string" ? d.initiatorUid : undefined;
      const consumed = Array.isArray(d.consumedUids) ? d.consumedUids : [];
      for (const raw of consumed) {
        const uid = String(raw);
        if (!uid || claimedExits.has(uid)) continue;
        claimedExits.add(uid);
        exits.push({ uid, kind: "fuse-consume", initiatorUid });
      }
      continue;
    }

    if (EXIT_BANISH.has(ev.type)) {
      const uid = uidFromDetails(d);
      if (uid && !claimedExits.has(uid) && !bounceOldUids.has(uid)) {
        claimedExits.add(uid);
        exits.push({ uid, kind: "banish" });
      }
      continue;
    }

    if (EXIT_DISSOLVE.has(ev.type)) {
      const uid = uidFromDetails(d);
      if (uid && !claimedExits.has(uid) && !bounceOldUids.has(uid)) {
        claimedExits.add(uid);
        exits.push({ uid, kind: "dissolve" });
      }
      continue;
    }

    if (ev.type === "returnToDeck") {
      const uid = uidFromDetails(d);
      if (uid && !claimedExits.has(uid)) {
        claimedExits.add(uid);
        exits.push({ uid, kind: "return-deck" });
      }
      continue;
    }

    if (ev.type === "damage") {
      const dealt = Number(d.dealt ?? d.amount ?? 0);
      const targetUid = typeof d.targetUid === "string" ? d.targetUid : typeof d.uid === "string" ? d.uid : undefined;
      if (dealt > 0 && targetUid) {
        pops.push({ kind: "damage", uid: targetUid, amount: dealt });
      }
      if (d.barrierPopped) {
        pops.push({ kind: "barrier-ring", uid: targetUid, amount: 0 });
      }
      continue;
    }

    if (ev.type === "restoreFollower") {
      const uid = typeof d.uid === "string" ? d.uid : undefined;
      const amount = Number(d.restored ?? d.amount ?? 0);
      if (uid && amount > 0) pops.push({ kind: "heal", uid, amount });
      continue;
    }

    if (ev.type === "leaderDamage") {
      const amount = Number(d.amount ?? 0);
      const player = typeof d.owner === "string" ? d.owner : undefined;
      if (player && amount > 0) pops.push({ kind: "damage", player, amount });
      continue;
    }

    if (ev.type === "restoreLeader" || ev.type === "drainRestore") {
      const amount = Number(d.amount ?? 0);
      const player =
        typeof d.player === "string"
          ? d.player
          : typeof d.owner === "string"
            ? d.owner
            : undefined;
      if (player && amount > 0) pops.push({ kind: "heal", player, amount });
      continue;
    }
  }

  for (const uid of nextUids) {
    if (!prevUids.has(uid) && !claimedEntries.has(uid)) {
      entries.push({ uid, kind: "generic" });
    }
  }

  for (const uid of prevUids) {
    if (!nextUids.has(uid) && !claimedExits.has(uid) && !bounceOldUids.has(uid)) {
      exits.push({ uid, kind: "fade" });
    }
  }

  return { entries, exits, pops, gap: false };
}

export function drainLog(
  lastSeenId: number,
  getLogs: () => LogEntryLike[],
): { events: LogEntryLike[]; newCursor: number; gap: boolean } {
  const all = getLogs();
  const fresh = all.filter((e) => e.id > lastSeenId).sort((a, b) => a.id - b.id);
  if (fresh.length === 0) {
    return { events: [], newCursor: lastSeenId, gap: false };
  }
  const firstId = fresh[0]!.id;
  const gap = firstId > lastSeenId + 1;
  const newCursor = fresh[fresh.length - 1]!.id;
  return { events: fresh, newCursor, gap };
}
