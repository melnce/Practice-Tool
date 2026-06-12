# Logger Surface Addendum (Phase 2 design input)

Read-only survey of `src/core/logger.ts` and `logEvent` emission shapes. No redesign proposals.

---

## Module API (`src/core/logger.ts`)

| Export | Signature | Behavior |
|--------|-----------|----------|
| `logEvent` | `(type: string, details?: any) => number \| undefined` | Appends entry; returns monotonic `id`; no-op when `globalThis.HEADLESS` |
| `getLogs` | `() => any[]` | Shallow copy of full ring buffer |
| `clearLogs` | `() => void` | Empties buffer |
| `setSessionTag` | `(tag: string) => void` | Sets optional session label on entries |
| `setConsoleMirroring` | `(enabled: boolean) => void` | Toggle console mirror (default true) |
| `setMaxLogEntries` | `(n: number) => void` | Resize cap (default 10000) |
| `downloadLogs` | `(filename?: string) => void` | Browser JSON export |
| `computeStateHash` | `() => Promise<string>` | SHA-256 (or FNV fallback) of normalized `state` |

**Window debug hooks** (lines 251–256): `_gameLog`, `downloadGameLog`, `clearGameLog`, `computeStateHash`, `setGameLogSession`.

### Entry shape (every `logEvent`)

```ts
{
  id: number;           // monotonic sequence, starts at 1 (++_id)
  ts: number;           // state.gameTick (deterministic, not wall clock)
  type: string;
  session: string | null;
  turn: number;         // state.roundCount
  activePlayer: string; // state.activePlayer
  details: object;      // caller payload
  stateHash: string | null;  // filled async after push
}
```

### Ring buffer

- **Capacity**: `_maxEntries = 10000` (line 150); configurable via `setMaxLogEntries`.
- **Overflow**: `_log.splice(0, _log.length - _maxEntries)` drops **oldest** entries (line 189).
- **AoE burst risk**: A single board wipe with multiple Last Words/deaths can emit dozens–hundreds of events (`death`, `lastWords`, `destroyQueued`, `trigger`, `damage`, etc.). 10k cap is unlikely exceeded in one burst for normal games; sustained long matches or debug-heavy logging could trim early-turn history. **No per-action grouping** — each `logEvent` is one row.

### Read API / subscribe

- **Poll**: `getLogs()` or `window._gameLog` (live array reference).
- **Snapshot**: `getLogs()` returns copy at call time; `downloadLogs()` exports `{ session, log }`.
- **Subscribe hook**: **None** — no listeners, observers, or event bus. UI must poll.
- **Index**: entries carry `id` (monotonic); no separate cursor API.

---

## Per-family payload shapes (uid presence)

### `draw`

| Site | details | uid |
|------|---------|-----|
| `core/utils.ts:191` | `{ owner, card: top.name, uid: top.uid }` | **yes** |
| `logic/core/turns.ts:258` | `{ player: nextPlayer, count: 1 }` | **no** (aggregate) |
| `logic/effects/ops/draw/unified.ts:62` | `{ owner: drawingPlayer, count }` | **no** |

### `playCard:start` / `playCard:outcome`

`logic/core/playCard/index.ts:38–49`

```ts
{ player, card: card.name, uid: card.uid, kind?: outcome.kind }
```

**uid: yes** on both.

### `summon`

| Site | details | uid |
|------|---------|-----|
| `summon_ops/direct.ts:63` | `{ owner, card, uid }` | **yes** |
| `summonFromHand` | `{ owner, card, uid }` | **yes** |
| `summonExactCopy` | `{ owner, from, uid }` | **yes** (clone) |
| `summonRandom` | `{ owner, picks: names[] }` | **no** |

### `attack` / combat damage

| type | Site | details | uid |
|------|------|---------|-----|
| `attack` | `combat.ts:295` | `{ attacker, defender, atkDmg, defDmg }` names only | **no** |
| `attackLeader` | `combat.ts:378` | `{ attacker, attackerUid, attackerPlayer }` | **partial** (attacker uid only) |
| `damage` | `barrier.ts:108` | `{ target, targetUid, amountTried, dealt, barrierPopped, preventedBySuper }` | **yes** (`targetUid`) |
| `damage` | `damage/primitives.ts:147` | `{ target, uid, amount }` | **yes** |

Heal: `restoreLeader` / `restoreFollower` — `{ player/uid/name, amount/restored }` — follower restore includes **uid** (`restore/primitives.ts:80`).

### `destroy`

| Site | details | uid |
|------|---------|-----|
| `destroy/primitives.ts:88` | `{ target, uid, type }` | **yes** |
| `targeted/index.ts:326` | `{ owner, target: name }` | **no** |
| `destroyQueued` | `{ card, owner, type, cause }` | **no** |
| `death` | `{ card, owner }` | **no** |

### `banish`

| Site | details | uid |
|------|---------|-----|
| `banish/primitives.ts:35` | `{ card, uid, owner }` | **yes** |
| `targeted/index.ts:280` | `{ owner, target: name }` | **no** |

### `bounce`

| Site | details | uid |
|------|---------|-----|
| `bounce.ts:85` | `{ from, name, oldUid, newUid }` | **yes** (old + new) |
| `targeted/index.ts:295` | `{ owner, target: name }` | **no** |

### `evolve` / `superEvolve`

| Site | details | uid |
|------|---------|-----|
| `evolveUtils.ts` | `{ owner, card, uid, mode? }` | **yes** |
| `superEvolve` | `{ owner, card, uid }` | **yes** |
| `targeted/index.ts` | `{ owner, target: name, mode }` | **no** |

### `fuse`

| type | uid in details |
|------|----------------|
| `fuseOpen` | **initiatorUid** (+ names, pool size) |
| `fuseFinalize` / `fuseConsume` | names only, **no card uids** |
| `fuseBlocked` | initiator **name** only |

### `countdownChange`

`countdown/unified.ts`, `counters.ts`, `crest.ts`:

```ts
{ card: name, owner, value }  // or crest name — **no uid**
```

### `startTurn` / `endTurn`

```ts
startTurn: { player, round, turn }
endTurn:   { from: endingPlayer }
```

**No uids** (player-slot only).

---

## Recon §3 families often missing uids

| Family | Typical gap |
|--------|-------------|
| `attack` (follower combat) | names only, no attackerUid/defenderUid |
| `death`, `destroyQueued`, `lastWords` | card name, no uid |
| `trigger` | `{ event, card: name }` |
| `banish` / `destroy` / `bounce` via `targeted/index` | target name only |
| `countdownChange` | card/crest name only |
| `draw` (batch) | count only |
| `summonRandom` | name array |
| `fuseFinalize` / `fuseConsume` | partner names, no uids |
| `startTurn` / `endTurn` | player slots |
| `history_*` | action meta, no card uids |

Families with reliable uids: `playCard:*`, most `summon` direct paths, `damage` (barrier path), `destroy` primitives, `banish` primitives, `bounceToHand`, `evolveUtils` / `superEvolve`, single-card `draw` in utils.
