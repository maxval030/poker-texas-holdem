# Texas Hold'em Online

เบราว์เซอร์ Texas Hold'em เงินสมมติ (play money) ต่อโต๊ะ — เล่นคนเดียวกับบอทในเครื่อง หรือสร้างห้องส่วนตัวแล้วเชิญเพื่อนเข้าด้วยรหัส

- **Solo** — รันใน Web Worker ทั้งก้อน ไม่ต้องเปิด server
- **Online** — ห้อง private สูงสุด 9 ที่นั่ง ผ่าน WebSocket + Valkey + Postgres
- UI รองรับไทย / อังกฤษ แนวโต๊ะสักหลาดเขียว เน้นมือถือแนวตั้ง

รายละเอียดออกแบบอยู่ที่ [`docs/superpowers/specs/2026-08-10-texas-holdem-design.md`](docs/superpowers/specs/2026-08-10-texas-holdem-design.md)

## ความต้องการของระบบ

- [Bun](https://bun.sh) **1.3.14+**
- Docker หรือ Podman (สำหรับ Postgres + Valkey ตอนเล่นออนไลน์)
- Node ไม่จำเป็น — ใช้ Bun ทั้ง repo

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

## ติดตั้งครั้งแรก

```bash
cd texas-holdem
bun install
cp .env.example .env
```

ค่าใน `.env` ค่าเริ่มต้นใช้กับ docker-compose ได้เลย เปลี่ยน `BETTER_AUTH_SECRET` ก่อนขึ้น production

OAuth (Google / GitHub / Discord) เป็นทางเลือก — เว้นว่างไว้ได้ เกมยังเข้าแบบ anonymous guest ได้

## เล่นคนเดียว (ไม่ต้อง infra)

Solo ไม่แตะ Postgres / Valkey / server

```bash
bun run dev:web
```

เปิด [http://localhost:3000](http://localhost:3000) แล้วเลือก **Play against bots** / **เล่นกับบอท**

## เล่นออนไลน์ (เต็มชุด)

เปิดเทอร์มินัล 3 อัน (หรือใช้ tmux)

**1) Infra**

```bash
bun run infra:up
# เทียบเท่า: docker compose up -d
# บนเครื่องนี้ถ้าไม่มี Docker socket ใช้: podman compose up -d
```

รอ Postgres (`5432`) กับ Valkey (`6379`) พร้อม

**2) Migrate + server**

```bash
bun run --cwd apps/server db:migrate
bun run dev:server
```

Server ฟังที่ [http://localhost:3001](http://localhost:3001)

**3) Web**

```bash
bun run dev:web
```

แล้วที่ [http://localhost:3000](http://localhost:3000):

1. **Create a private table** — ได้รหัสเชิญ
2. ส่งรหัสให้เพื่อน → **Join with a code**
3. นั่งที่นั่ง เพิ่มบอทได้ แล้วกด **Deal**

Guest จะถูกสร้างอัตโนมัติตอนเข้าห้อง (ไม่ต้องล็อกอิน OAuth)

หยุด infra:

```bash
bun run infra:down
```

## สคริปต์ที่ใช้บ่อย

| คำสั่ง | ความหมาย |
| --- | --- |
| `bun run infra:up` / `infra:down` | เปิด/ปิด Postgres + Valkey |
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
