# Hand Result Banner & Opt-in Show — Design Spec

Date: 2026-08-10  
Status: Approved (grill complete)  
Related: [`CONTEXT.md`](../../../CONTEXT.md), ADRs `0001`–`0003`

## 1. Purpose

After each hand is awarded, every client sees a clear center-table **Result banner**: who won, optional **Hand category** when a winner Shows, and **Chip deltas** for everyone who put chips in the hand. Humans who are allowed to Show may Show or Muck once; bots never Show.

## 2. Decisions (from grill)

| Topic | Choice |
| --- | --- |
| Architecture | Authoritative **Reveal window** in table lifecycle (engine/host), not UI-only |
| Fold win | No Hand category unless the winner Shows |
| Who may Show | Fold win: winning human only. Showdown: every contesting human-controlled seat |
| Bots | Never Show (immediate Muck / not Eligible shower) |
| Timeout | 8s Reveal window; unanswered → Muck |
| Show once | Show is irreversible for that hand |
| Banner timing | Appears as soon as pots are awarded; category/cards fill in on Show |
| Chip delta | `awards − totalCommitted` for the hand |
| Delta roster | Everyone who put chips in the hand (including folders) |
| Split winners | Banner names all winners; category per winner who Showed |
| Banner duration | Stays until next hand (after Reveal window + existing hand interval) |
| Solo | Same rules as online |
| No eligible shower | Skip Reveal window; still show banner + hand interval |
| Disconnect / leave in window | Muck for that seat |
| Bot-controlled seat at settlement | Not Eligible shower |
| Shown cards UI | At the seat; category text on the banner only |
| Category detail | Category label only (e.g. Full house), not kicker prose |

## 3. Lifecycle

```
… betting ends
→ pots formed & awarded (stacks updated, pot-awarded events)
→ Result banner visible (winners + chip deltas; categories pending)
→ if any Eligible shower:
     Reveal window (8s deadline)
     humans send show | muck (once each)
     disconnect/leave/timeout → muck
   else:
     skip window
→ apply visibility: only Shown hole cards leave the host redaction boundary
→ wait handIntervalMs → start next hand (existing host behaviour)
```

### Breaking change from current code

Today `viewFor` sets `revealAll = hand.complete` and exposes every non-folded hole card. That must stop. Visibility becomes: viewer’s own cards always (while in hand); after award, only seats that have **Shown** for this hand; folded seats never Show.

## 4. Domain terms

Canonical language lives in [`CONTEXT.md`](../../../CONTEXT.md): Hand, Reveal window, Show, Muck, Fold win, Showdown, Hand category, Chip delta, Contesting player, Eligible shower, Split winners, Result banner.

## 5. Authoritative state (shape)

Exact field names are implementation details; the host/engine must persist enough to survive Valkey snapshot / failover:

- Per hand after award: list of pot awards `{ seat, amount, potIndex }`, per-player `totalCommitted`, winner seat set
- Reveal: `deadline`, per eligible seat `pending | shown | mucked`
- Derived Chip delta per seat: `sum(awards) - totalCommitted`
- Hand category on the banner: from existing Cactus Kev score via `handCategory(score)`, and only for **winners who Showed**. Non-winners who Show still expose hole cards at their seat but do not get a category line on the banner.

## 6. Protocol (client ↔ host)

Add client messages (names indicative):

- `{ type: 'show' }`
- `{ type: 'muck' }`

Server continues to push `update` snapshots. Events may include:

- awards / hand-result summary for banner (or embed in view)
- `player-shown` / reveal settled notifications for animation

Reject `show`/`muck` if not Eligible shower, already decided, or outside Reveal window.

## 7. UI

- Center overlay on the virtual stage (above board): winner name(s), optional category line(s), scrollable/compact chip delta list (`+` brass / `−` muted red)
- Eligible local human: Show / Muck controls + 8s clock (CSS deadline pattern like action clock)
- i18n th/en for banner chrome and Hand category labels
- Emote tray / leave remain available; Leave ⇒ Muck for self

## 8. Bot & solo

- Bot seats: never Eligible shower
- Solo worker uses the same host path so behaviour matches online

## 9. Non-goals

- Kicker-level hand descriptions
- Large duplicate hole cards on the banner
- Forcing Show for winners
- Chat / hand history log
- Changing side-pot math

## 10. Acceptance

1. Fold win by human: banner + deltas; no category until Show; Show reveals seat cards + category  
2. Fold win by bot: banner + deltas; no Reveal window; no category  
3. Showdown with humans: each can Show/Muck once; timeout Mucks; only Shown cards visible to others  
4. Split winners: all names on banner; categories only for those who Showed  
5. Chip deltas match awards − committed for every contributor  
6. Disconnect during window Mucks that seat  
7. Multi-instance: choices and visibility survive ownership failover via snapshot  
8. Solo matches online rules  

## 11. ADRs

- [0001 — Opt-in Show after award](../../adr/0001-opt-in-show-after-award.md)
- [0002 — Chip delta formula](../../adr/0002-chip-delta-is-awards-minus-committed.md)
- [0003 — Skip window without human showers](../../adr/0003-skip-reveal-window-without-human-showers.md)
