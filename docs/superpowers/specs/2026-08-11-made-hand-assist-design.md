# Made Hand Assist, Hand Chart & Result Banner Placement — Design Spec

Date: 2026-08-11  
Status: Approved (grill complete; design sections approved)  
Related: [`CONTEXT.md`](../../../CONTEXT.md), ADRs `0004`–`0005`

## 1. Purpose

Help seated players read their current poker hand while playing: an optional **Made hand** label beside the hero seat with **Contributing cards** highlighted on hole and board, a toggleable **Hand chart** of category examples, and a **Result banner** raised so it no longer covers the community cards.

## 2. Decisions (from grill)

| Topic | Choice |
| --- | --- |
| Computation | Client-local from hero hole + public board (ADR 0004) |
| When shown | From deal (preflop) until fold or hand complete |
| Selection rule | Standard best five among available cards; unused holes = playing the board |
| Hand chart UX | Header control → overlay; category name + static mini-card examples |
| Fold | Hide Made hand immediately |
| Highlight | Glow/border on contributing; dim non-contributing visible cards |
| Result banner | Centered horizontally; vertically above the board |
| Audience | Local seated hero only (not spectators) |
| After award | Hide Made hand; Result banner / Reveal window take over |
| Chart entry | Header near language switch (separate from Made hand assist) |
| Best-five ties | First combo in fixed enumeration order |
| Narrow layout | Made hand label moves above hero frame |
| Chart dismiss | Close button, backdrop click, Esc |
| Preflop unpaired | Both hole cards contributing |
| Assist toggle | On/off; localStorage; first visit default on (ADR 0005) |
| Toggle scope | Made hand label + highlight only (chart stays separate) |
| Architecture | Engine `madeHand` helper + thin web HUD |

## 3. Domain terms

Canonical language: [`CONTEXT.md`](../../../CONTEXT.md) — **Made hand**, **Contributing cards**, **Hand chart**, **Made hand assist**, **Hand category**, **Result banner**.

## 4. Engine: `madeHand`

Add a pure helper in `@holdem/engine` (name may be `madeHand` in `madeHand.ts` or adjacent to the reference ranker):

```ts
madeHand(hole: Card[], board: Card[]): {
  category: HandCategory
  holeContributing: Card[]
  boardContributing: Card[]
} | null
```

Rules:

- Return `null` if `hole.length !== 2`.
- **Preflop** (`board.length === 0`): classify the two hole cards; both are contributing (pair or high-card hand).
- **Flop / turn / river** (`board.length` 3–5): among all 5-card subsets of `hole ∪ board` (or the sole five when `n === 5`), pick the best score using the same ranking family as `referenceEvaluate7` / `rank5`. Map category from that ranker **directly** — do **not** use `handCategory(score)` (Cactus Kev bounds; solo/server inject `referenceEvaluate7`).
- If several subsets tie for best score, use the **first** in the fixed combination order already used by the reference evaluator.
- `holeContributing` / `boardContributing` are the cards from that winning subset that belong to hole vs board (order stable / sorted by appearance in the subset as convenient for tests).

Export from the engine package index. Cover with unit tests (preflop pair, playing the board, one-hole flush, deterministic tie).

## 5. Web

### 5.1 Made hand assist preference

- Storage key e.g. `holdem.madeHandAssist` with values `'1' | '0'`, same pattern as `holdem.locale`.
- Missing key → treat as **on**.
- Control in the table **header** beside `LanguageSwitch` (and Hand chart button).

### 5.2 Made hand HUD

Visible when all of:

- assist is on  
- viewer is seated and can see own hole cards  
- `madeHand(...)` is non-null  
- viewer has not folded this hand  
- hand is not complete (no Result banner phase)

UI:

- Hand category label to the **right** of the hero seat chrome; on narrow viewports, **above** the hero frame.
- Pass contributing sets into `Seat` (hero holes) and `Board` so `PlayingCard` can apply contributing vs dimmed styles.
- i18n: reuse existing `hand.*` category keys.

### 5.3 Result banner placement

Keep horizontal center at `board.cx`. Move vertical position **above** the board card row so the five community cards remain visible (offset from current `board.cy` centering). No change to banner content or Show/Muck rules.

### 5.4 Hand chart

- Header button opens an overlay listing the nine Hand categories strongest → weakest.
- Each row: translated name + a **static** mini-card example for that category.
- Dismiss via close control, backdrop click, or Escape.
- Independent of Made hand assist (available even when assist is off).

## 6. Out of scope

- Server-authoritative Made hand or prefs  
- Spectator / other-seat Made hand  
- Equity %, pot odds, kicker prose in the label  
- Changing settlement, Show/Muck, or protocol version  
- Replacing `referenceEvaluate7` with Cactus on solo/server  

## 7. Acceptance

1. With assist on, hero sees category update preflop → river; contributing cards highlighted; unused cards dimmed.  
2. Playing the board: only board cards highlighted when holes are unused.  
3. Assist off: no label, no highlight/dim from Made hand; Hand chart still openable.  
4. Preference survives reload (localStorage); first visit defaults on.  
5. Fold or hand complete: Made hand HUD hidden.  
6. Result banner sits above the board and does not cover community cards.  
7. Hand chart shows nine ranks with examples; dismissible as specified.  
8. Engine `madeHand` tests green; web typecheck / existing i18n parity still pass.

## 8. ADRs

- [0004 — Made hand is client-local](../../adr/0004-made-hand-is-client-local.md)  
- [0005 — Made hand assist is a local viewer toggle](../../adr/0005-made-hand-assist-is-opt-in.md)  
