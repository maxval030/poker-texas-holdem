# Display Name Gate Before Online Play — Design Spec

Date: 2026-08-11  
Status: Approved  
Related: `apps/web/src/routes/room.$code.tsx`, `room.join.tsx`, `room.create.tsx`, `auth/client.ts`

## 1. Purpose

Everyone who plays online must set a display name before entering a table. Direct invite links (`/room/$code`) previously skipped the name form. Names are stored as `{base}-{xxxx}` so seat labels rarely collide.

## 2. Decisions

| Topic | Choice |
| --- | --- |
| Where | Create, join-by-code, and invite-link room page |
| Base name | Required, trimmed, length ≥ 3 and ≤ 20 |
| Suffix | 4 chars from alphabet without ambiguous `0/O/1/I/l` |
| Format | `{base}-{xxxx}` (e.g. `Max-A7k2`) |
| Returning session | If signed-in user already has a usable name, **do not** ask again |
| Empty / Guest default | Not allowed for first-time naming |

## 3. Behavior

### Helper (`apps/web/src/auth/displayName.ts`)

- `hasUsableDisplayName(name)` — false for empty, short, or placeholders (`Guest` / `Host` / `Anonymous`)
- `buildDisplayName(base)` — validate 3–20, append `-` + 4 random chars via `crypto.getRandomValues`
- Charset: `23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz`

### Routes

- `/room/$code` — gate until named; then fetch room / attach transport
- `/room/join` and `/room/create` — hide name field when session already named; otherwise require ≥ 3 chars
- `ensureSignedIn` updates name when a new display name is provided, even for an existing session

## 4. Out of scope

- Server-side uniqueness enforcement  
- Renaming mid-hand  
- Solo bot lobby names  

## 5. Acceptance

1. Invite link without a prior named session shows a name form; cannot continue with &lt; 3 chars.  
2. After naming, seat shows `{base}-{xxxx}`.  
3. Reopening the same link with the same session skips the form.  
4. Create / join-by-code cannot submit with empty or short names.  
5. i18n en+th for new strings; typecheck / i18n tests pass.
