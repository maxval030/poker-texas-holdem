# Solo Lobby Buy-in Picker — Design Spec

Date: 2026-08-11  
Status: Approved (design sections approved)  
Related: `apps/web/src/routes/play.solo.tsx`, solo worker / host `add-bot`

## 1. Purpose

On the solo lobby (before sitting against bots), let the player choose their starting stack within the table buy-in range, with slider + number input. Bots seat with the same stack so the table stays balanced.

## 2. Decisions

| Topic | Choice |
| --- | --- |
| Control | Slider **and** number input, kept in sync |
| Range | `CONFIG.minBuyIn`–`maxBuyIn` (2_000–10_000) |
| Default | 5_000 |
| Step | 500 |
| Invalid / blur | Clamp to range; snap down to nearest step of 500 |
| Bot stacks | Same `buyIn` as the human |
| Persistence | None (session default each visit) |

## 3. Behavior

### Lobby UI (`SoloLobby`)

- Replace hardcoded `BUY_IN` with state `buyIn` (default 5_000).
- Field labeled Buy-in (i18n th/en):
  - `input type="range"` min/max/step from config
  - `input type="number"` same bounds/step
  - Changing either updates `buyIn` (clamp while dragging/typing as appropriate; snap on blur for the number field)
- CTA: “Sit down with {buyIn} chips” (localized), using the live value.
- `onStart` passes `buyIn` into `SoloSetup` as today.

### Bots

- Solo worker passes the chosen buy-in when seating bots.
- Host `add-bot` accepts optional `buyIn`; if omitted, keep current behavior (`config.maxBuyIn`) so online rooms unchanged.
- Protocol: extend `{ type: 'add-bot', seat, difficulty, buyIn?: number }` (no version bump required if additive optional field; bump only if repo convention demands it for any client message change — prefer optional field without bump when backward compatible).

## 4. Out of scope

- Remember last buy-in in localStorage  
- Changing blinds / table config from the lobby  
- Online room create/join buy-in UI (already separate)

## 5. Acceptance

1. Lobby shows buy-in slider + number; default 5,000.  
2. Values stay within 2,000–10,000 and align to step 500 after blur.  
3. Sit-down uses the chosen stack for the hero.  
4. Each bot starts with the same stack.  
5. Online `add-bot` without `buyIn` still uses `maxBuyIn`.  
6. i18n en+th for new strings; typecheck / web tests green.
