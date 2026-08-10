# Texas Hold'em Online

เบราว์เซอร์ Texas Hold'em เงินสมมติ (play money) ต่อโต๊ะ — เล่นคนเดียวกับบอทในเครื่อง หรือสร้างห้องส่วนตัวแล้วเชิญเพื่อนเข้าด้วยรหัส

- **Solo** — รันใน Web Worker ทั้งก้อน ไม่ต้องเปิด server
- **Online** — ห้อง private สูงสุด 9 ที่นั่ง ผ่าน WebSocket + Valkey + Postgres
- UI รองรับไทย / อังกฤษ แนวโต๊ะสักหลาดเขียว เน้นมือถือแนวตั้ง

รายละเอียดออกแบบอยู่ที่ [`docs/superpowers/specs/2026-08-10-texas-holdem-design.md`](docs/superpowers/specs/2026-08-10-texas-holdem-design.md)

## ความต้องการของระบบ

- Docker หรือ Podman (ทางลัดด้านล่าง)
- หรือ [Bun](https://bun.sh) **1.3.14+** ถ้าจะรันแบบ local โดยไม่ containerize ทั้งก้อน

## รันทั้งก้อนด้วยคำสั่งเดียว

ไฟล์ `docker-compose.yml` ใช้ได้ทั้ง Docker และ Podman

**เครื่อง local ที่ใช้ Podman (เช่น CachyOS ที่ไม่มี Docker socket):**

```bash
cd texas-holdem
bun run podman:up
# เทียบเท่า: podman compose up --build -d
```

**Docker (เช่น production / CI):**

```bash
bun run docker:up
# เทียบเท่า: docker compose up --build -d
```

เปิด [http://localhost:3000](http://localhost:3000)

Compose จะสร้างและรัน:

| บริการ | พอร์ต | หน้าที่ |
| --- | --- | --- |
| `web` | 3000 | UI (TanStack Start) |
| `server` | 3001 | API + WebSocket (migrate ให้เองตอนสตาร์ท) |
| `postgres` | 5432 | ฐานข้อมูล |
| `valkey` | 6379 | lock / pub-sub / ticket |

หยุด / ดู log:

| | Podman | Docker |
| --- | --- | --- |
| หยุด | `bun run podman:down` | `bun run docker:down` |
| log | `bun run podman:logs` | `bun run docker:logs` |

ตั้ง `BETTER_AUTH_SECRET` ใน `.env` ก่อนขึ้นของจริง (ค่า default ใน compose เป็นของ dev เท่านั้น)

## โครงสร้างสั้นๆ

```
apps/web        TanStack Start — UI + solo worker
apps/server     Elysia — auth, rooms, WebSocket
packages/engine กติกาโป๊กเกอร์ (pure reducer)
packages/bot    การตัดสินใจของบอท
packages/host   เจ้าของโต๊ะ (timer, disconnect → bot)
packages/cards  SVG ไพ่
packages/protocol  ข้อความ client ↔ server
```

## รันแบบ local (Bun บนเครื่อง)

```bash
cd texas-holdem
bun install
cp .env.example .env
```

OAuth (Google / GitHub / Discord) เป็นทางเลือก — เว้นว่างไว้ได้ เกมยังเข้าแบบ anonymous guest ได้

### เล่นคนเดียว (ไม่ต้อง infra)

```bash
bun run dev:web
```

เปิด [http://localhost:3000](http://localhost:3000) แล้วเลือก **Play against bots** / **เล่นกับบอท**

### เล่นออนไลน์แบบ hot-reload

```bash
bun run infra:podman:up   # แค่ Postgres + Valkey (Podman)
# หรือ: bun run infra:up   # ถ้าใช้ Docker
bun run --cwd apps/server db:migrate
bun run dev:server        # :3001
bun run dev:web           # :3000
```

แล้วที่เว็บ: สร้างห้อง → ส่งรหัส → นั่ง → เพิ่มบอท → **Deal**

## สคริปต์ที่ใช้บ่อย

| คำสั่ง | ความหมาย |
| --- | --- |
| `bun run podman:up` / `podman:down` / `podman:logs` | ทั้งก้อนด้วย Podman (local) |
| `bun run docker:up` / `docker:down` / `docker:logs` | ทั้งก้อนด้วย Docker (prod/CI) |
| `bun run infra:podman:up` / `infra:podman:down` | แค่ Postgres + Valkey (Podman) |
| `bun run infra:up` / `infra:down` | แค่ Postgres + Valkey (Docker) |
| `bun run dev:server` | Elysia แบบ watch ที่พอร์ต 3001 |
| `bun run dev:web` | UI ที่พอร์ต 3000 |
| `bun run --cwd apps/server db:migrate` | รัน migration |
| `bun run --cwd apps/server db:studio` | Drizzle Studio |
| `bun test` | เทสทั้ง monorepo |
| `bun run typecheck` | TypeScript |
| `bun run check` | Biome lint/format |
| `bun run cards:build` | สร้าง court sprite ใหม่ |

## Environment

ดูรายการเต็มใน [`.env.example`](.env.example)

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://holdem:holdem@localhost:5432/holdem` | Postgres |
| `VALKEY_URL` | `redis://localhost:6379` | lock / pub-sub / ticket |
| `SERVER_PORT` | `3001` | พอร์ต Elysia |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS + cookie |
| `BETTER_AUTH_SECRET` | (dev default) | เซ็น session |
| `BETTER_AUTH_URL` | `http://localhost:3001` | base URL ของ auth |
| `VITE_API_URL` | `http://localhost:3001` | REST จากเบราว์เซอร์ |
| `VITE_WS_URL` | `ws://localhost:3001` | WebSocket จากเบราว์เซอร์ |

Bun อ่าน `.env` ที่รากโปรเจกต์ตอนรัน server ได้โดยตรง Vite อ่าน `VITE_*` จาก `.env` เช่นกัน

## หมายเหตุสั้นๆ

- เงินเป็น play money ต่อโต๊ะ — นั่งแล้วได้ stack ใหม่ ออกโต๊ะแล้วหาย
- คนหลุด: grace 30 วินาที แล้วบอทเล่นแทน คืนที่นั่งตอนจบมือ ปล่อยที่นั่งถาวรที่ 10 นาที
- ห้องว่างคนจริง 5 นาที หรือสร้างแล้วไม่มีใครเข้า 2 นาที จะถูกปิด
- มีแค่ emote ไม่มีแชท / hand history / lobby สาธารณะ
- หลังจบมือมีสรุปกลางจอ และคนเลือกโชว์/ไม่โชว์ไพ่ได้ 8 วินาที (บอทไม่โชว์)
- เปิด/ปิดตัวช่วยอ่านมือข้างที่นั่งได้ และมีตารางมือตัวอย่างในหัวตาราง
