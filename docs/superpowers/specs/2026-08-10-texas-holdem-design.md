# Texas Hold'em Online — Design Specification

Date: 2026-08-10
Status: Approved

## 1. Purpose

A browser-based Texas Hold'em poker game with two modes that share one rules engine:

- **Single player** — entirely client-side, played against bots in a Web Worker. No server involvement.
- **Online** — private rooms joined by invite link or code, up to 9 seats, realtime over WebSocket, horizontally scalable across multiple backend instances.

Success means a player can open the site on a phone in portrait orientation, play a full hand against bots with no server round trip, then create a private room, send a link to eight friends, and have every one of them play a correct hand of poker with correct side pots — including when one of them loses connection mid-hand.

## 2. Scope decisions

Every item below was decided explicitly, not assumed.

### Money

Play money, per-table only. Sitting down grants a fresh stack; leaving discards it. There is no persistent bankroll, no ledger, no transaction table, and no cross-room balance. This removes any need for atomic money transfers or financial audit trails, and keeps chips as pure in-room state.

### Game format

Cash game is built first. The state machine is designed so Sit & Go can be added without restructuring, but SNG is not implemented in this phase.

Options available when creating a room are constrained by format so that no configuration can produce a game that cannot end:

- **Cash game** — host chooses unlimited rebuy, limited rebuy count, or bust-to-spectator.
- **Sit & Go** (future) — bust always means spectator. The host may enable a rebuy period covering the first N blind levels, which is the real tournament rule.

An unlimited rebuy in a tournament would prevent elimination entirely, turning it into a cash game with escalating blinds. That combination is disallowed.

### Bust behaviour

Configured per room within the constraints above.

### Authentication

OAuth (Google, GitHub, Discord) and guest/anonymous only. No email/password, no magic links.

Anyone opening an invite link can join as a guest by choosing a display name. Better Auth's `anonymous` plugin creates a real user row flagged as anonymous, which can later be linked to a real account.

### Disconnect handling

1. Socket drops. A 30 second grace period begins, during which the seat auto-checks or auto-folds when it is that player's turn. This absorbs ordinary network blips without handing the seat to a bot.
2. After 30 seconds the seat's `controller` switches from `human` to `bot`. The stack is untouched; the bot plays the disconnected player's chips.
3. On reconnect the seat returns to human control at the next hand boundary, never mid-hand, so no state changes hands while a betting round is open.
4. If the player never returns, the seat is released after 10 minutes and their chips leave with them.
5. A bot never rebuys on behalf of an absent human. If it busts the stack, the seat becomes sitting-out with zero chips until the owner returns and chooses to rebuy.

The 10 minute seat release only applies while the room is Active. If every human leaves, the room closes at 5 minutes, which arrives first.

### Bots

Rule-based with Monte Carlo equity estimation, tuned along two personality axes (tightness and aggression) and three difficulty tiers (easy, normal, hard). The same code serves both the "add bot" feature and disconnect takeover; only configuration differs.

Bots are always visibly labelled as bots.

### Scale

Expected load is tens of concurrent tables. The architecture must support horizontal scaling without a rewrite, but is not optimised for scale beyond that.

### Presentation

- 2D, DOM and SVG, not Canvas.
- Portrait-first for phones, landscape for tablets, largest target iPad Pro.
- Classic theme: green felt table, wood rail, casino chips.
- Thai and English, switchable.

### Social features

Tap-to-send emotes only. No text chat, no hand history, no outside spectators. Players busted out of a room may watch until the room closes, which is a consequence of the bust-to-spectator option rather than a separate feature.

### Room discovery

Private only. Rooms are reached by invite link or a generated code. There is no public lobby.

### Action clock

Configurable by the host at room creation (15, 20, 30, or 60 seconds). Expiry auto-checks if checking is free, otherwise auto-folds.

### Room lifecycle

- **Created** → **Closed** if nobody joins within 2 minutes.
- **Active** → **Dormant** when the number of connected humans reaches zero.
- **Dormant** → **Active** on any human reconnect, or → **Closed** after 5 minutes.
- Bots do not count toward occupancy. A room holding eight bots and zero humans is empty.
- While Dormant the in-progress hand is frozen rather than played out by bots, because advancing a game nobody is watching burns CPU for no one.

## 3. Verified technology choices

All versions were checked against the npm registry and official documentation on 2026-08-10 rather than recalled.

### Runtime and backend

- `bun@1.3.14`
- `elysia@1.4.29` — the stable line. Elysia 2.0 is a full rewrite still in beta with an unmigrated plugin ecosystem.
- `@elysiajs/openapi@1.4.15` — supersedes `@elysiajs/swagger`, which has not shipped in 14 months.
- `better-auth@1.6.26` with `@better-auth/drizzle-adapter@1.6.26`
- `drizzle-orm@0.45.2` with `drizzle-kit@0.31.10`
- `postgres@3.4.9` via `drizzle-orm/postgres-js`
- `iovalkey@0.4.0`

### Frontend

- `@tanstack/react-start@1.168.42`, `@tanstack/react-router`, `@tanstack/react-query@5.101.4`
- React 19 — required, because TanStack Start's Bun deployment path does not support React 18
- `zustand` for table state
- `motion@13.0.0` for animation
- `@pokertools/evaluator` for hand evaluation
- `radashi@12.9.1` for general utilities

### Three constraints that overrode the original brief

**Drizzle v1 RC was rejected.** The brief asked for the latest Drizzle v1 release candidate. Doing so forces Better Auth onto its own 1.7 release candidate, because `better-auth@1.6.x` generates `import { relations } from "drizzle-orm"`, an export that v1 removed, so the generated schema will not compile. That would place two release candidates in the authentication and persistence core, against the brief's stronger requirement to prefer stable versions. The all-stable combination is used instead, giving up Relational Queries v2, which this schema does not need.

**TanStack Store and TanStack DB were rejected in favour of Zustand.** The brief asked to prefer TanStack tooling. TanStack Store is at 0.11.1 with a two-paragraph overview page that describes it as internal infrastructure for other TanStack libraries. TanStack DB is pre-1.0 and architecturally opposed to this problem: it is built to sync database collections with optimistic local writes, whereas poker requires a single authoritative server, ephemeral state, and strict hidden information.

**`Bun.SQL` was rejected in favour of postgres.js.** Bun issues [#33985](https://github.com/oven-sh/bun/issues/33985) and [#33665](https://github.com/oven-sh/bun/issues/33665) describe a prepared-statement pipeline bug that silently deadlocks the connection pool under mixed read/write concurrency and can decode rows against the wrong statement metadata. The fix is merged but absent from every tagged Bun release. A poker backend with bursty concurrency at hand boundaries is precisely the workload that triggers it.

## 4. Architecture

TanStack Start has no WebSocket support — the term does not appear anywhere in its documentation — and the community Nitro workaround is reported broken specifically on Bun. Rather than fight this, the frontend and the realtime backend are separate processes from the start, which is the correct shape for an authoritative game server regardless.

```
Browser
  React UI
    ├── WebSocket transport ──► Elysia instance (any)
    └── Worker transport ─────► Web Worker (engine + bots)

Elysia instances ◄──► Valkey (pub/sub, ownership locks, state snapshots)
Elysia instances ────► Postgres (users, sessions, room metadata)
```

The UI talks through a single transport interface, so it cannot tell whether it is driving a Web Worker or a WebSocket. This is what makes single player and online share one UI without branching.

### Engine

A pure reducer:

```
reduce(state, command) → [nextState, events[]]
```

No I/O, no clock reads, no internal randomness. Time and RNG seeds are injected. This makes the engine testable by replay, runnable identically in Bun and in a Web Worker, and deterministic enough that a recorded event log reproduces a hand exactly.

Cards are encoded as integers 0–51, with rank as `n >> 2` and suit as `n & 3`, so a deck is a 52-byte `Uint8Array` and shuffling is an in-place swap loop.

### Table ownership

Each table is owned by exactly one instance at a time, holding a Valkey lock with a TTL renewed by heartbeat.

A client may connect to any instance. If that instance is not the owner, it forwards the command over Valkey pub/sub to the owner. The owner applies it through the engine, appends the resulting events to a sequence, snapshots state to Valkey, and publishes the events. Every instance receives them, filters per recipient, and writes to its own sockets.

Pub/sub alone would not be sufficient. Poker requires strict serialisation of actions per table; two instances applying actions concurrently would corrupt pot arithmetic. Ownership provides the serialisation, and pub/sub provides only transport.

Cross-instance messages carry an origin ID. Without it, clients on the originating instance receive every message twice — once from the local `server.publish()` and once from the Valkey round trip.

### WebSocket authentication

Session cookies accompany a WebSocket upgrade only for same-origin browser clients, and the `WebSocket` constructor cannot set headers. Since the frontend and API are separate origins, authentication uses a ticket:

1. Client calls `POST /ws-ticket` over ordinary authenticated HTTP.
2. Server issues a short-lived single-use token stored in Valkey.
3. Client connects to `wss://.../table/:id?ticket=...`.
4. Server consumes the ticket atomically in `beforeHandle`, before the upgrade completes.

Better Auth's `cookieCache` must not be used for this check. A revoked session stays valid until the cache expires, which for an hours-long socket means a banned player keeps playing. Sessions are validated against the database on upgrade, and live sockets are closed on a revocation event.

### Hole card privacy

Events published to Valkey contain every player's cards, because a new owner must be able to reconstruct the hand after a failover. Filtering happens at the edge: before writing to any socket, an instance strips cards the recipient is not entitled to see. No client ever receives another player's hole cards before showdown.

### Cleanup

Every Valkey key belonging to a room carries a TTL renewed only by the owner's heartbeat. If the owner dies, the keys expire on their own within seconds. Postgres rows left in the `open` state are reconciled by a janitor task running periodically on whichever instance holds the janitor lock, which closes any room whose live state has vanished.

Ordinary teardown cancels all timers, closes remaining sockets, unsubscribes channels, deletes keys, releases the ownership lock, marks the room closed in Postgres, and invalidates the invite code.

## 5. Repository layout

Bun workspaces:

- `packages/engine` — poker rules only. Pure functions, zero dependencies.
- `packages/evaluator` — hand evaluation behind a two-function interface, plus shuffling primitives.
- `packages/bot` — bot decision making.
- `packages/protocol` — WebSocket message types shared by both sides.
- `packages/cards` — card SVG generation and the asset build script.
- `apps/web` — TanStack Start frontend.
- `apps/server` — Elysia backend.

The WebSocket protocol is documented as shared TypeScript types rather than through OpenAPI. Elysia registers WebSocket routes under a pseudo-method `WS`, which `@elysiajs/openapi` lowercases into a `"ws"` key that is invalid under OpenAPI 3.x, and it drops message and response schemas entirely. REST endpoints are still documented through OpenAPI normally.

## 6. Card assets

The reference image supplied is a raster of the CC0 "English pattern playing cards deck" by Dmitry Fomin, arranged 13 columns by 4 rows. Two problems ruled out slicing it directly: 950 pixels does not divide evenly into 13 columns, so fractional cropping bleeds neighbouring borders; and at 73 pixels wide the faces are too low-resolution for an iPad Pro at 2× device pixel ratio, especially beside the vector card back.

The chosen approach is hybrid:

- **40 pip cards (A through 10)** are generated in code from rank and suit. Pip layout follows the standard arrangement. These are tiny, resolution-independent, and themeable.
- **12 court cards (J, Q, K)** use the individual CC0 SVGs that Wikimedia has already extracted from the deck, optimised and combined into one sprite. No geometric slicing is required.
- **The card back** is generated in code as a diagonal plaid in green and dark red, matching the Atlas deck design supplied, but drawn at the same aspect ratio as the faces. The original is 2:3 while the faces are 5:7; using both unmodified would make cards visibly change shape mid-flip.

All three kinds render as inline SVG sharing one `viewBox`.

## 7. Known hazards

These are the places where poker implementations characteristically go wrong, and where testing effort concentrates.

**Side pots.** Nine players going all-in at different stack depths produces a main pot and several side pots, plus refunds to anyone who bet more than any opponent could call. This is the single most common source of bugs in poker software.

**Re-raise reopening.** When an all-in raise is smaller than a full raise, the betting round is not reopened for players who have already acted. They may call or fold but not re-raise. This rule is frequently implemented incorrectly.

**Shuffling.** Radashi's `shuffle` uses `Math.random`, which is predictable and unacceptable for dealing. Real deals use a cryptographic RNG. This is an explicit, justified exception to the prefer-radashi policy.

**Monte Carlo hot loop.** Radashi's `shuffle` allocates a fresh array per call and was measured 17× slower than an in-place partial Fisher-Yates over an `Int32Array` — costing more than the 180,000 hand evaluations it feeds. Simulations use the in-place version. Bot decisions are also bounded by a wall-clock budget of roughly 30 ms, not merely an iteration cap, so eight bots thinking at once cannot stall a table.

**Evaluator reentrancy.** `@pokertools/evaluator` reuses module-level scratch arrays and is documented as unsafe under recursion or shared memory. Each Worker gets its own module instance. Cards are converted to integer codes once; the string API is 6× slower and must never appear in a loop.

**Countdown rendering.** A timer implemented as `setInterval` plus `setState` re-renders the entire table once per second. Instead the server sends a deadline timestamp, and the countdown ring is a CSS animation whose duration is computed from it, producing zero React renders while it runs.

## 8. Testing strategy

- **Chip conservation as a property test.** Across any sequence of legal actions, the sum of all stacks plus all pots is invariant. This one property catches most side pot bugs without enumerating cases.
- **Golden tests for side pots**, built from multi-way all-in scenarios with hand-verified payouts.
- **Replay tests** driven by recorded event logs, made possible by the engine being pure and seed-injected.
- **Two-process integration tests** against real Valkey in Docker Compose, covering ownership failover and room cleanup after an instance is killed without warning.
