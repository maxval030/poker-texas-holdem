# Hand Result Banner & Opt-in Show Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each hand is awarded, show a center Result banner (winners, optional Hand category, Chip deltas) and run an 8s opt-in Show/Muck Reveal window for eligible humans before the next hand.

**Architecture:** Extend `HandState` with a `reveal` block after pots are awarded. Stop auto-exposing hole cards in `viewFor` when `complete`; only seats with `shown` expose cards. Host schedules the reveal deadline, maps `show`/`muck` client messages, auto-mucks bots and disconnects, then uses the existing `handIntervalMs` once reveal is settled. Web reads `view.result` for the banner and Show/Muck controls.

**Tech Stack:** Bun workspaces, `@holdem/engine` reducer, `@holdem/host`, `@holdem/protocol`, React + Zustand + motion in `apps/web`, existing i18n.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-hand-result-reveal-design.md`
- Glossary: `CONTEXT.md`; ADRs `docs/adr/0001`–`0003`
- Reveal window: **8_000 ms** fixed
- Chip delta: **awards − totalCommitted** for the hand
- Bots / bot-controlled seats: **never Show**
- Show is **irreversible**; timeout / disconnect / leave → **Muck**
- Banner category: **category label only** via `handCategory(score)`, winners who Showed only
- PROTOCOL_VERSION bump to **2** when client messages change
- Exact pinned dependency versions already in the repo — do not upgrade
- TDD: failing test before implementation in each task; commit after each task

## File map

| File | Responsibility |
| --- | --- |
| `packages/engine/src/types.ts` | `RevealState`, `HandResult`, commands, events |
| `packages/engine/src/result.ts` | Pure helpers: eligible showers, chip deltas, settle reveal |
| `packages/engine/src/engine.ts` | Award → enter reveal; handle show/muck/timeout-reveal |
| `packages/engine/src/view.ts` | Redact by Show; attach `result` to view |
| `packages/engine/src/handrank.ts` | Existing `handCategory` (reuse) |
| `packages/engine/test/reveal.test.ts` | Engine reveal + view tests |
| `packages/protocol/src/messages.ts` | `show` / `muck` client messages; bump protocol |
| `packages/host/src/host.ts` | Deadline, bot skip, disconnect→muck, gate next hand |
| `packages/host/test/reveal.test.ts` | Host reveal scheduling tests |
| `apps/web/src/table/ResultBanner.tsx` | Center overlay UI |
| `apps/web/src/table/TableScreen.tsx` | Mount banner |
| `apps/web/src/table/store.ts` | Selectors for result / canShow |
| `apps/web/src/i18n/messages.ts` | th/en strings for banner + categories |
| `apps/web/src/table/Seat.tsx` | Already shows hole cards from view (no change if view correct) |

---

### Task 1: Engine types + reveal helpers

**Files:**
- Create: `packages/engine/src/result.ts`
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/index.ts` (export `result.ts`)
- Test: `packages/engine/test/reveal.test.ts`

**Interfaces:**
- Produces:
  - `RevealChoice = 'pending' | 'shown' | 'mucked'`
  - `RevealState = { deadline: number | null; settled: boolean; choices: { seat: number; choice: RevealChoice }[]; awards: { seat: number; amount: number; potIndex: number }[] }`
  - `HandResultEntryView = { seat: number; name?: never; delta: number; awarded: number; committed: number }` (name filled in view layer)
  - `chipDeltas(awards, players): { seat: number; awarded: number; committed: number; delta: number }[]`
  - `eligibleRevealSeats(state: TableState): number[]` — contesting humans only (occupant.kind === 'human' && controller === 'human'); fold-win ⇒ winner only; showdown ⇒ all contesting humans
  - `allRevealDecided(reveal: RevealState): boolean`
  - `REVEAL_WINDOW_MS = 8_000`

- [ ] **Step 1: Write failing helper tests**

```ts
// packages/engine/test/reveal.test.ts
import { describe, expect, test } from 'bun:test'
import { chipDeltas, allRevealDecided } from '../src/result.ts'

describe('chipDeltas', () => {
  test('awards minus committed for every contributor', () => {
    const players = [
      { seat: 0, totalCommitted: 100 },
      { seat: 1, totalCommitted: 200 },
      { seat: 2, totalCommitted: 50 },
    ]
    const awards = [
      { seat: 1, amount: 350, potIndex: 0 },
    ]
    expect(chipDeltas(awards, players)).toEqual([
      { seat: 0, awarded: 0, committed: 100, delta: -100 },
      { seat: 1, awarded: 350, committed: 200, delta: 150 },
      { seat: 2, awarded: 0, committed: 50, delta: -50 },
    ])
  })
})

describe('allRevealDecided', () => {
  test('true when no pending choices', () => {
    expect(
      allRevealDecided({
        deadline: 1,
        settled: false,
        awards: [],
        choices: [
          { seat: 0, choice: 'shown' },
          { seat: 1, choice: 'mucked' },
        ],
      }),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test packages/engine/test/reveal.test.ts`  
Expected: FAIL module not found / exports missing

- [ ] **Step 3: Implement types + helpers**

Add to `HandState` in `types.ts`:

```ts
export type RevealChoice = 'pending' | 'shown' | 'mucked'

export interface RevealAward {
  seat: number
  amount: number
  potIndex: number
}

export interface RevealState {
  deadline: number | null
  settled: boolean
  choices: { seat: number; choice: RevealChoice }[]
  awards: RevealAward[]
}
```

On `HandState` add `reveal: RevealState | null` (null while hand in progress).

Add commands:

```ts
| { type: 'show'; seat: number }
| { type: 'muck'; seat: number }
| { type: 'timeout-reveal' }
```

Add events:

```ts
| { type: 'reveal-started'; deadline: number | null; seats: number[] }
| { type: 'player-shown'; seat: number }
| { type: 'player-mucked'; seat: number }
| { type: 'reveal-settled' }
```

Implement `packages/engine/src/result.ts` with `REVEAL_WINDOW_MS`, `chipDeltas`, `allRevealDecided`, and `eligibleRevealSeats(state)` reading `state.seats[i].controller === 'human'` and `occupant?.kind === 'human'`, contesting = hand players with `status !== 'folded'`. If contesting length === 1, only that seat if eligible; else all eligible contesting seats. Auto-fill bot contesting seats as `{ choice: 'mucked' }` when building initial reveal in Task 2 (helper may return only human seats).

Export from `index.ts`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/engine/test/reveal.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/result.ts packages/engine/src/index.ts packages/engine/test/reveal.test.ts
git commit -m "feat(engine): add reveal state types and chip delta helpers"
```

---

### Task 2: Engine enter reveal on endHand + show/muck commands

**Files:**
- Modify: `packages/engine/src/engine.ts` (`endHand`, new command handlers)
- Modify: `packages/engine/test/reveal.test.ts`
- Modify: `packages/engine/test/engine.test.ts` if any assertion breaks on new field

**Interfaces:**
- Consumes: `eligibleRevealSeats`, `REVEAL_WINDOW_MS`, `allRevealDecided` from `result.ts`
- Produces: after awards, `hand.reveal` set; `hand.complete === true`; `timeout-reveal` settles pendings to mucked; `start-hand` still requires previous reveal settled OR no hand

- [ ] **Step 1: Write failing integration tests**

```ts
test('fold win starts reveal with only the human winner pending', () => {
  // sit human seat 0, bot seat 1, deal, fold bot → end hand
  // expect hand.complete && hand.reveal
  // expect choices: winner pending (or shown/mucked only humans); bot seats mucked or absent
  // expect reveal-started event
})

test('show then rejects a second show', () => {
  // … reach reveal …
  reduce(state, { type: 'show', seat: winner }, ctx)
  const again = reduce(state, { type: 'show', seat: winner }, ctx)
  expect(again.events.some((e) => e.type === 'error')).toBe(true)
})

test('timeout-reveal mucks pending and settles', () => {
  reduce(state, { type: 'timeout-reveal' }, ctx)
  expect(state.hand?.reveal?.settled).toBe(true)
  expect(state.hand?.reveal?.choices.every((c) => c.choice !== 'pending')).toBe(true)
})
```

Use existing harness patterns from `packages/engine/test/helpers.ts` / `engine.test.ts`.

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/engine/test/reveal.test.ts`  
Expected: FAIL on missing reveal behaviour

- [ ] **Step 3: Implement in `endHand`**

After computing `awards` and applying stacks / `pot-awarded` events:

```ts
hand.complete = true
hand.actorSeat = null
hand.deadline = null

const humanSeats = eligibleRevealSeats(state)
const choices = [
  ...humanSeats.map((seat) => ({ seat, choice: 'pending' as const })),
]
// Contesting bots are not in choices (never Show).

hand.reveal = {
  deadline: humanSeats.length > 0 ? ctx.now + REVEAL_WINDOW_MS : null,
  settled: humanSeats.length === 0,
  choices,
  awards,
}
events.push({
  type: 'reveal-started',
  deadline: hand.reveal.deadline,
  seats: humanSeats,
})
if (hand.reveal.settled) events.push({ type: 'reveal-settled' })
```

Handlers:

- `show`: seat must be pending → `shown` + `player-shown`; if `allRevealDecided` → `settled` + `reveal-settled`
- `muck`: same with `mucked`
- `timeout-reveal`: all `pending` → `mucked`; `settled = true`; `reveal-settled`

`start-hand` must no-op or fail while `hand?.reveal && !hand.reveal.settled`.

Initialize `reveal: null` in `startHand`.

- [ ] **Step 4: Run full engine tests**

Run: `bun test packages/engine`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/engine.ts packages/engine/test/reveal.test.ts packages/engine/test/engine.test.ts
git commit -m "feat(engine): enter reveal window after pots are awarded"
```

---

### Task 3: viewFor redaction + result payload

**Files:**
- Modify: `packages/engine/src/view.ts`
- Modify: `packages/engine/src/types.ts` or keep result types in `result.ts` / `view.ts`
- Test: `packages/engine/test/reveal.test.ts`

**Interfaces:**
- Produces on `TableStateView`:
  ```ts
  result: null | {
    winners: number[]
    deltas: { seat: number; delta: number; awarded: number; committed: number }[]
    categories: { seat: number; category: HandCategory }[] // winners who shown only
    revealDeadline: number | null
    canShow: boolean // viewer is pending eligible
    settled: boolean
  }
  ```
- Hole cards visible if `player.seat === viewerSeat` OR choice for that seat is `'shown'`

- [ ] **Step 1: Failing tests**

```ts
test('complete hand does not expose mucked opponent cards', () => {
  // winner mucked, viewer is other seat / spectator
  const view = viewFor(state, null)
  const opp = view.hand?.players.find((p) => p.seat === winner)
  expect(opp?.holeCards).toBeNull()
})

test('shown winner exposes cards and category on result', () => {
  const view = viewFor(state, winnerSeat)
  expect(view.result?.categories.some((c) => c.seat === winnerSeat)).toBe(true)
  expect(view.hand?.players.find((p) => p.seat === winnerSeat)?.holeCards).not.toBeNull()
})
```

Need score at show: when applying `show`, engine should store score on the choice or recompute in view via `evaluate7` — **prefer store on reveal choice** optional field `score?: number` set at show time using hole+board (fold-win still has hole cards). For fold-win category after Show, compute score in show handler with `ctx.evaluate7`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement view + score-on-show**

In show handler after marking shown:

```ts
const player = hand.players.find((p) => p.seat === seat)
if (player) {
  const score = ctx.evaluate7([...player.holeCards, ...hand.board])
  // store on choices entry: score
}
```

Extend choice type: `{ seat; choice; score?: number }`.

`viewFor`: remove `revealAll = hand.complete`. Visibility:

```ts
const shown = new Set(
  hand.reveal?.choices.filter((c) => c.choice === 'shown').map((c) => c.seat) ?? [],
)
const visible = player.seat === viewerSeat || shown.has(player.seat)
```

Build `result` when `hand.complete && hand.reveal`:

- `winners` = unique seats with award amount > 0
- `deltas` = `chipDeltas(reveal.awards, hand.players)`
- `categories` = winners ∩ shown with `handCategory(score)`
- `canShow` = viewerSeat pending in choices
- `revealDeadline` / `settled` from reveal

- [ ] **Step 4: `bun test packages/engine` — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/view.ts packages/engine/src/types.ts packages/engine/src/engine.ts packages/engine/test/reveal.test.ts
git commit -m "feat(engine): redact hole cards until Show and expose hand result view"
```

---

### Task 4: Protocol + host reveal scheduling

**Files:**
- Modify: `packages/protocol/src/messages.ts` — add show/muck; `PROTOCOL_VERSION = 2`
- Modify: `packages/host/src/host.ts`
- Create: `packages/host/test/reveal.test.ts`

**Interfaces:**
- ClientMessage: `| { type: 'show' } | { type: 'muck' }`
- Host: on reveal-started with deadline, schedule `timeout-reveal`; do not `scheduleNextHand` until `reveal.settled`; on leave/disconnect of pending seat dispatch muck; never offer show to bots

- [ ] **Step 1: Host failing tests with ManualClock**

```ts
test('schedules timeout-reveal then next hand after interval', () => {
  // play to fold win with human winner, handIntervalMs 1000
  // advance 8000 → reveal settled
  // advance 1000 → new hand started
})

test('leave during reveal mucks', () => {
  // human pending, send leave → choice mucked
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement host**

In `receive`:

```ts
case 'show': {
  const seat = this.requireSeat(userId)
  if (seat === null) return
  this.dispatch(userId, { type: 'show', seat })
  return
}
case 'muck': { /* same */ }
```

In `settle()` / after dispatch when `hand.complete && reveal && !reveal.settled`:

- cancel next-hand schedule
- if `reveal.deadline !== null`, schedule at deadline → `timeout-reveal`
- if settled, `scheduleNextHand()` as today

On `disconnect` / leave path: if seat pending in reveal, `dispatch(null, { type: 'muck', seat })`.

`scheduleNextHand` guard:

```ts
if (this.state.hand?.reveal && !this.state.hand.reveal.settled) return
```

- [ ] **Step 4: `bun test packages/host packages/protocol` — PASS** (protocol may have no tests)

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/messages.ts packages/host/src/host.ts packages/host/test/reveal.test.ts
git commit -m "feat(host): schedule reveal window and wire show/muck messages"
```

---

### Task 5: Web ResultBanner + i18n + controls

**Files:**
- Create: `apps/web/src/table/ResultBanner.tsx`
- Modify: `apps/web/src/table/TableScreen.tsx` — render `<ResultBanner />` inside `Stage`
- Modify: `apps/web/src/table/store.ts` — `useHandResult()` selector
- Modify: `apps/web/src/i18n/messages.ts` — keys
- Modify: `apps/web/src/i18n/messages.test.ts` — th keys exist

**Interfaces:**
- Consumes: `view.result`, seat names from `view.seats`, `send({ type: 'show' | 'muck' })`
- CSS clock from `result.revealDeadline` + `clockSkewMs` like `ActionClock`

- [ ] **Step 1: Add i18n keys (en + th)**

Keys at minimum:

- `result.winner` / `result.splitWinners`
- `result.youWin` (optional)
- `result.show` / `result.muck`
- `hand.straightFlush` … `hand.highCard` (map from `HandCategory`)
- `result.foldedWin` not needed if no category line

Update `messages.test.ts` — still checks every en key has th.

- [ ] **Step 2: Implement `useHandResult` + `ResultBanner`**

Banner content:

- Title: join winner names from `seats[w].occupant.name`
- For each `result.categories`: translated category
- List deltas sorted by seat: `Name` + `+X` / `−X` using `chips()`
- If `canShow && !settled`: buttons Show / Muck + drain bar for deadline

Mount inside `Stage` after `Board` with high z-index, centered on felt.

- [ ] **Step 3: Manual sanity (solo)**

Run: `bun run dev:web` → Play against bots → finish a hand → confirm banner, Show/Muck for hero when eligible, bots never prompt.

- [ ] **Step 4: `bun test apps/web/src/i18n` && `bun run typecheck` — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/table/ResultBanner.tsx apps/web/src/table/TableScreen.tsx apps/web/src/table/store.ts apps/web/src/i18n/messages.ts apps/web/src/i18n/messages.test.ts
git commit -m "feat(web): center hand result banner with Show/Muck controls"
```

---

### Task 6: Regression sweep + docs touch

**Files:**
- Modify: `README.md` — one bullet under notes about Show/Muck
- Verify: engine, host, server tests still green

- [ ] **Step 1: Run**

```bash
bun test packages/engine packages/host apps/web
bun run typecheck
bun run check
```

Expected: all PASS / clean

- [ ] **Step 2: README note**

Add under หมายเหตุ: หลังจบมือมีสรุปกลางจอ และคนเลือกโชว์/ไม่โชว์ไพ่ได้ 8 วินาที (บอทไม่โชว์)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: note hand result banner and Show/Muck window"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Result banner winners + deltas | 3, 5 |
| Category only if winner Shows | 3, 5 |
| Reveal window 8s | 1, 2, 4 |
| Eligible humans only; bots never | 1, 2, 4 |
| Timeout/disconnect/leave → Muck | 2, 4 |
| Show irreversible | 2 |
| Skip window if no humans | 2, 4 |
| Stop auto-reveal on complete | 3 |
| Chip delta formula | 1, 3 |
| All contributors in delta list | 1, 5 |
| Split winner names | 5 |
| Cards at seat | 3 + existing Seat |
| Solo same path | 4 (shared host) |
| Failover via state | 2 (reveal on HandState snapshot) |
| Protocol show/muck | 4 |

## Self-review notes

- No TBD placeholders
- `RevealState` / `result` view field names consistent across tasks
- Category uses existing `handCategory` — no kicker prose
- `PROTOCOL_VERSION = 2` called out in Task 4
