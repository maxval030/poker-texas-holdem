# Made Hand Assist & Hand Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional client-side Made hand HUD (category + contributing-card highlight), a Hand chart overlay with category examples, and Result banner placement above the board.

**Architecture:** Pure `madeHand(hole, board)` in `@holdem/engine` (same ranking family as `referenceEvaluate7` / `rank5`, category mapped directly—not via Cactus `handCategory`). Web reads local hole + board, applies a localStorage Made hand assist preference, and renders label/highlights; Hand chart is a separate header overlay with static examples.

**Tech Stack:** Bun workspaces, `@holdem/engine`, React + existing table Stage/Seat/Board/PlayingCard, i18n th/en, localStorage (same pattern as locale).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-made-hand-assist-design.md`
- Glossary: `CONTEXT.md`; ADRs `docs/adr/0004`, `docs/adr/0005`
- Made hand is **client-local**; never put on authoritative `view` / protocol
- Assist preference key: **`holdem.madeHandAssist`** values `'1' | '0'`; missing → **on**
- Hide Made hand on **fold** or **hand.complete**
- Hero seat only; Hand chart independent of assist
- Do not upgrade pinned dependencies
- TDD: failing test before implementation in each task that has logic; commit after each task
- Commit glossary/ADR/spec/plan docs when they are part of a task’s deliverable (do not leave them only dirty in the worktree)

## File map

| File | Responsibility |
| --- | --- |
| `packages/engine/src/madeHand.ts` | `madeHand(hole, board)` pure helper |
| `packages/engine/src/reference.ts` | Export / reuse `rank5` + combo order (minimal touch) |
| `packages/engine/src/index.ts` | Export `madeHand` |
| `packages/engine/test/madeHand.test.ts` | Engine unit tests |
| `apps/web/src/table/madeHandAssist.tsx` | localStorage preference + hook |
| `apps/web/src/table/useMadeHand.ts` | Derive made hand + visibility from store |
| `apps/web/src/table/MadeHandLabel.tsx` | Category label by hero seat |
| `apps/web/src/table/HandChart.tsx` | Overlay + static examples |
| `apps/web/src/table/PlayingCard.tsx` | Optional `emphasized` ring for contributing |
| `apps/web/src/table/Seat.tsx` | Dim/emphasize hero holes; mount label |
| `apps/web/src/table/Board.tsx` | Dim/emphasize board cards |
| `apps/web/src/table/ResultBanner.tsx` | Raise vertical position above board |
| `apps/web/src/table/TableScreen.tsx` | Header toggles + Hand chart mount |
| `apps/web/src/i18n/messages.ts` | Assist / chart chrome strings |
| `README.md` | One-line note if useful |

---

### Task 1: Engine `madeHand` helper

**Files:**
- Create: `packages/engine/src/madeHand.ts`
- Modify: `packages/engine/src/reference.ts` (export `rank5` if not already public; keep combo table reusable)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/madeHand.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MadeHand = {
    category: HandCategory
    holeContributing: Card[]
    boardContributing: Card[]
  }

  export function madeHand(hole: readonly Card[], board: readonly Card[]): MadeHand | null
  ```
- Consumes: `rank5`, `HandCategory`, `Card`, `rankOf` / `suitOf` as needed

- [ ] **Step 1: Write failing tests**

```ts
// packages/engine/test/madeHand.test.ts
import { describe, expect, test } from 'bun:test'
import { parseCards } from '../src/cards.ts'
import { madeHand } from '../src/madeHand.ts'

describe('madeHand', () => {
  test('null when hole is not two cards', () => {
    expect(madeHand([], [])).toBeNull()
    expect(madeHand(parseCards('As'), [])).toBeNull()
  })

  test('preflop pair', () => {
    const hole = parseCards('As Ad')
    const result = madeHand(hole, [])
    expect(result?.category).toBe('one-pair')
    expect(result?.holeContributing).toEqual(hole)
    expect(result?.boardContributing).toEqual([])
  })

  test('preflop high card highlights both holes', () => {
    const hole = parseCards('As Kd')
    const result = madeHand(hole, [])
    expect(result?.category).toBe('high-card')
    expect(result?.holeContributing).toEqual(hole)
  })

  test('playing the board uses no hole cards', () => {
    // Board straight; holes do not improve
    const hole = parseCards('2c 7d')
    const board = parseCards('9s Ts Js Qs Ks')
    const result = madeHand(hole, board)
    expect(result?.category).toBe('straight')
    expect(result?.holeContributing).toEqual([])
    expect(result?.boardContributing).toEqual(board)
  })

  test('flush can use one hole card', () => {
    const hole = parseCards('As 2d')
    const board = parseCards('Ks 9s 4s 3c 7h')
    const result = madeHand(hole, board)
    expect(result?.category).toBe('flush')
    expect(result?.holeContributing).toEqual(parseCards('As'))
    expect(new Set(result?.boardContributing)).toEqual(new Set(parseCards('Ks 9s 4s 3c')))
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test packages/engine/test/madeHand.test.ts
```

Expected: fail (module / function missing)

- [ ] **Step 3: Implement**

In `madeHand.ts`:

1. If `hole.length !== 2` return `null`.
2. Preflop (`board.length === 0`): if `rankOf(hole[0]) === rankOf(hole[1])` → `one-pair`, else `high-card`; both holes contributing; board contributing `[]`.
3. Otherwise let `cards = [...hole, ...board]`. If `cards.length < 5`, return `null` (Hold'em never deals 1–2 board cards; do not invent partial boards).
4. Enumerate 5-card index combos in the **same order** as `referenceEvaluate7` (export shared `COMBINATIONS_N_CHOOSE_5` helper or specialize for `n` in 5..7). Track best `rank5` score (lower better) and first winning index tuple.
5. Map `rank5` score → `HandCategory` via category index `Math.floor(score / TUPLE_SPAN)` where `TUPLE_SPAN = 13**5` (same as `reference.ts`). Export a small `categoryFromRank5Score` next to `rank5` or keep private constants duplicated once in `madeHand.ts` matching `reference.ts`.
6. Split winning five into `holeContributing` / `boardContributing` by membership in the original hole/board arrays (preserve first-seen order).

Export from `index.ts`.

- [ ] **Step 4: `bun test packages/engine/test/madeHand.test.ts` — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/madeHand.ts packages/engine/src/reference.ts packages/engine/src/index.ts packages/engine/test/madeHand.test.ts
git commit -m "feat(engine): add madeHand helper for best category and contributing cards"
```

---

### Task 2: Made hand assist preference + header controls

**Files:**
- Create: `apps/web/src/table/madeHandAssist.tsx`
- Modify: `apps/web/src/table/TableScreen.tsx`
- Modify: `apps/web/src/i18n/messages.ts`
- Modify: `apps/web/src/i18n/messages.test.ts` (only if parity test needs updates — usually auto-covers new en keys)

**Interfaces:**
- Produces:
  ```ts
  export function useMadeHandAssist(): {
    enabled: boolean
    setEnabled(next: boolean): void
  }
  ```
- Storage: `localStorage['holdem.madeHandAssist']` = `'1' | '0'`; missing → enabled `true`

- [ ] **Step 1: Implement preference module** (pattern from `apps/web/src/i18n/locale.tsx`)

```tsx
// apps/web/src/table/madeHandAssist.tsx
const STORAGE_KEY = 'holdem.madeHandAssist'

function readStored(): boolean {
  if (typeof window === 'undefined') return true
  const v = window.localStorage.getItem(STORAGE_KEY)
  if (v === null) return true
  return v !== '0'
}

export function useMadeHandAssist() {
  const [enabled, setEnabledState] = useState(true)
  useEffect(() => {
    setEnabledState(readStored())
  }, [])
  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }, [])
  return { enabled, setEnabled }
}
```

- [ ] **Step 2: i18n keys** (en + th)

- `assist.madeHand` — short label for toggle (e.g. "Hand help" / "ช่วยอ่านมือ")
- `assist.handChart` — "Hand chart" / "ตารางมือ"

- [ ] **Step 3: Header UI in `TableScreen`**

Beside `LanguageSwitch`, add:
- toggle button or checkbox for Made hand assist (`aria-pressed={enabled}`)
- placeholder button for Hand chart that no-ops or opens state later (Task 5 can wire open) — prefer local `useState` `chartOpen` now so Task 5 only fills the overlay

- [ ] **Step 4: `bun test apps/web/src/i18n` && `bun run typecheck` — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/table/madeHandAssist.tsx apps/web/src/table/TableScreen.tsx apps/web/src/i18n/messages.ts
git commit -m "feat(web): add Made hand assist preference and header controls"
```

---

### Task 3: Made hand HUD + card emphasis

**Files:**
- Create: `apps/web/src/table/useMadeHand.ts`
- Create: `apps/web/src/table/MadeHandLabel.tsx`
- Modify: `apps/web/src/table/PlayingCard.tsx` — add optional `emphasized?: boolean`
- Modify: `apps/web/src/table/Seat.tsx`
- Modify: `apps/web/src/table/Board.tsx`
- Modify: `apps/web/src/table/TableScreen.tsx` or `Seat.tsx` to mount label for hero

**Interfaces:**
- Consumes: `madeHand` from `@holdem/engine`, `useMadeHandAssist`, table store (`viewerSeat`, hole cards, board, player status, `hand.complete`)
- Produces visibility gate:

```ts
// useMadeHand.ts
export function useHeroMadeHand(): {
  made: MadeHand | null
  visible: boolean
}
// visible = assist on && made && !folded && !complete && hole visible
```

- [ ] **Step 1: Selector / hook**

Read from `useTableStore`:
- `viewerSeat`
- hero `hand.players` entry hole cards (face-up array)
- `hand.board`, `hand.complete`
- folded if `player.status === 'folded'`

Call `madeHand(hole, board)` when hole length is 2.

- [ ] **Step 2: `PlayingCard` emphasis**

```tsx
// when emphasized, add ring class e.g. className includes 'ring-2 ring-brass-300/80'
// when dimmed (existing), keep opacity 0.45
// If both: prefer emphasized over dimmed for contributing cards
```

- [ ] **Step 3: Wire Seat + Board**

Hero seat only:
- For each hole card, `emphasized={visible && holeContributing.includes(card)}`, `dimmed={visible && !holeContributing.includes(card)}`
- Board: same with `boardContributing`
- Non-hero seats unchanged

- [ ] **Step 4: `MadeHandLabel`**

Position absolute relative to hero seat box:
- Default: to the **right** of seat chrome (`left: box.left + box.width/2 + gap`, `top: box.top`)
- Narrow: when `layout.width` portrait / viewport short — place **above** seat (`top: box.top - offset`)
- Text: `t(CATEGORY_KEY[made.category])` — reuse keys from `ResultBanner` (`hand.straightFlush` …)

Mount from `Seat` when `slice.isViewer && visible`, or from `TableScreen` with hero layout coords.

- [ ] **Step 5: `bun run typecheck` — PASS**

Manual sanity optional: solo play one hand with assist on.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/table/useMadeHand.ts apps/web/src/table/MadeHandLabel.tsx apps/web/src/table/PlayingCard.tsx apps/web/src/table/Seat.tsx apps/web/src/table/Board.tsx apps/web/src/table/TableScreen.tsx
git commit -m "feat(web): show Made hand label and highlight contributing cards"
```

---

### Task 4: Raise Result banner above the board

**Files:**
- Modify: `apps/web/src/table/ResultBanner.tsx`

**Interfaces:**
- Consumes: `useLayout().board` (`cx`, `cy`, `cardWidth`)

- [ ] **Step 1: Change position**

Replace centering on `board.cy` with an offset above the board row:

```tsx
const cardHeight = board.cardWidth * 1.5
const top = board.cy - cardHeight / 2 - 120 // stage units; tune so banner clears cards
// keep left: board.cx, -translate-x-1/2 -translate-y-1/2
style={{ left: board.cx, top, width: 520 }}
```

If `120` still clips, increase until community cards are fully visible in portrait + landscape fixtures (eyeball against `geometry` stages).

- [ ] **Step 2: Visual check** (solo or fixture) — banner must not cover the five board slots

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/table/ResultBanner.tsx
git commit -m "fix(web): move Result banner above community cards"
```

---

### Task 5: Hand chart overlay

**Files:**
- Create: `apps/web/src/table/HandChart.tsx`
- Modify: `apps/web/src/table/TableScreen.tsx` — wire `chartOpen`
- Modify: `apps/web/src/i18n/messages.ts` — title / close if needed
- Optional: tiny static example card list using `PlayingCard` or compact rank/suit text

**Interfaces:**
- Static examples (fixed `Card[]` per category), strongest → weakest:

```ts
const CHART: { category: HandCategory; example: string }[] = [
  { category: 'straight-flush', example: 'As Ks Qs Js Ts' },
  { category: 'four-of-a-kind', example: 'Ac Ad Ah As Kc' },
  { category: 'full-house', example: 'Ac Ad Ah Kc Kd' },
  { category: 'flush', example: 'As Js 9s 6s 2s' },
  { category: 'straight', example: 'Ac Kd Qh Js Tc' },
  { category: 'three-of-a-kind', example: 'Ac Ad Ah Kc Qd' },
  { category: 'two-pair', example: 'Ac Ad Kc Kd Qh' },
  { category: 'one-pair', example: 'Ac Ad Kc Qd Jh' },
  { category: 'high-card', example: 'Ac Kd Qh Js 9d' },
]
```

- [ ] **Step 1: Implement overlay**

- Full-screen `fixed`/`absolute` backdrop `bg-black/60`
- Panel: list rows with `t(CATEGORY_KEY[category])` + five mini `PlayingCard` (small width ~36)
- Close button; `onClick` backdrop closes; `useEffect` keydown `Escape` closes
- Does not require Made hand assist on

- [ ] **Step 2: Wire header button** from Task 2 to `setChartOpen(true)`

- [ ] **Step 3: `bun test apps/web/src/i18n` && `bun run typecheck` — PASS**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/table/HandChart.tsx apps/web/src/table/TableScreen.tsx apps/web/src/i18n/messages.ts
git commit -m "feat(web): add Hand chart overlay with category examples"
```

---

### Task 6: Docs commit + regression sweep

**Files:**
- Ensure committed: `CONTEXT.md`, `docs/adr/0004-*.md`, `docs/adr/0005-*.md`, `docs/superpowers/specs/2026-08-11-made-hand-assist-design.md`, `docs/superpowers/plans/2026-08-11-made-hand-assist.md`
- Modify: `README.md` — one short bullet under notes about Made hand assist / Hand chart (th or en matching README style)

- [ ] **Step 1: Run**

```bash
bun test packages/engine apps/web
bun run typecheck
bun run check
```

Expected: all PASS / clean

- [ ] **Step 2: README bullet** (Thai notes section if that is the house style)

Example: เปิด/ปิดตัวช่วยอ่านมือข้างที่นั่งได้ และมีตารางมือตัวอย่างในหัวตาราง

- [ ] **Step 3: Commit docs + any biome fixes**

```bash
git add CONTEXT.md docs/adr/0004-made-hand-is-client-local.md docs/adr/0005-made-hand-assist-is-opt-in.md docs/superpowers/specs/2026-08-11-made-hand-assist-design.md docs/superpowers/plans/2026-08-11-made-hand-assist.md README.md
git commit -m "docs: Made hand assist spec, ADRs, and plan"
```

(If biome touched feature files in step 1, separate `chore:` commit first.)

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `madeHand` pure helper + category without Cactus map | 1 |
| Assist localStorage default on | 2 |
| Header assist toggle | 2 |
| Label + highlight + dim | 3 |
| Hide on fold / complete | 3 |
| Narrow label above hero | 3 |
| Banner above board | 4 |
| Hand chart examples + dismiss | 5 |
| Chart independent of assist | 2, 5 |
| Docs / ADR / README | 6 |

## Self-review notes

- No TBD placeholders
- `MadeHand` type names consistent across tasks
- Category mapping explicitly avoids `handCategory(score)` for reference scores
- Pref key `holdem.madeHandAssist` fixed
- PlayingCard already has `dimmed`; Task 3 adds `emphasized` only
