# Online stats, room lifecycle, and closing warnings

Date: 2026-08-11  
Status: Implemented

## Summary

- **GET /stats/online** — public `{ rooms, players }` via Valkey presence
- **Janitor** — idle 30m, session 4h, existing created/dormant/orphan rules
- **closing-soon** WS message + banner (protocol v3)
- **Guest rate limit** — max 2 concurrent open tables per host (`isAnonymous`)
- **DELETE /rooms/:id** — host closes table immediately

## Key files

| Area | Path |
|---|---|
| Constants | `apps/server/src/rooms/constants.ts` |
| Activity | `apps/server/src/rooms/activity.ts` |
| Closing warnings | `apps/server/src/rooms/closing.ts` |
| Lifecycle | `apps/server/src/rooms/lifecycle.ts` |
| Presence | `apps/server/src/realtime/presence.ts` |
| Stats API | `apps/server/src/stats/routes.ts` |
| Protocol | `packages/protocol/src/messages.ts` (v3) |
| Home stats | `apps/web/src/routes/index.tsx` |
| Close button | `apps/web/src/routes/room.$code.tsx` |

## Migration

`apps/server/drizzle/0001_last_human_action_at.sql` adds `last_human_action_at`.
