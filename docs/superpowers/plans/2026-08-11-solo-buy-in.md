# Solo Lobby Buy-in Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let solo players pick buy-in (slider + number) before sitting; bots use the same stack.

**Architecture:** Lobby state drives `SoloSetup.buyIn`. Optional `buyIn` on protocol `add-bot`; host uses it when present else `maxBuyIn`. Solo worker passes chosen buy-in for each bot.

**Tech Stack:** React lobby in `play.solo.tsx`, `@holdem/protocol`, `@holdem/host`, existing i18n.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-solo-buy-in-design.md`
- Range from `CONFIG.minBuyIn`–`maxBuyIn`; default **5_000**; step **500**
- Bots same buy-in as human; online `add-bot` without buyIn unchanged
- Do not upgrade deps; TDD where host behavior changes; commit after each task

## File map

| File | Responsibility |
| --- | --- |
| `apps/web/src/routes/play.solo.tsx` | Buy-in UI + state |
| `apps/web/src/i18n/messages.ts` | Labels |
| `packages/protocol/src/messages.ts` | Optional `buyIn` on `add-bot` |
| `packages/host/src/host.ts` | Honor optional buyIn |
| `packages/host/test/host.test.ts` | Assert bot stack |
| `apps/web/src/solo/worker.ts` | Pass buyIn when adding bots |

---

### Task 1: Protocol + host optional bot buyIn

**Files:**
- Modify: `packages/protocol/src/messages.ts`
- Modify: `packages/host/src/host.ts`
- Modify: `packages/host/test/host.test.ts`

- [ ] **Step 1: Failing test** — add-bot with `buyIn: 5_000` seats bot at 5_000; add-bot without buyIn still maxBuyIn

- [ ] **Step 2: Implement** — `buyIn?: number` on add-bot; host `buyIn: message.buyIn ?? this.state.config.maxBuyIn` (validate against min/max like human sit if sit already validates)

- [ ] **Step 3: `bun test packages/host packages/protocol` — PASS**

- [ ] **Step 4: Commit** `feat(host): allow optional buyIn on add-bot`

---

### Task 2: Solo lobby UI + worker

**Files:**
- Modify: `apps/web/src/routes/play.solo.tsx`
- Modify: `apps/web/src/solo/worker.ts`
- Modify: `apps/web/src/i18n/messages.ts`

- [ ] **Step 1: Lobby** — `buyIn` state; range + number; clamp/snap helpers; CTA uses live value; i18n

- [ ] **Step 2: Worker** — `add-bot` includes `buyIn: setup.buyIn`

- [ ] **Step 3: `bun test apps/web/src/i18n` && `bun run typecheck` — PASS**

- [ ] **Step 4: Commit** `feat(web): solo lobby buy-in slider and number input`

---

### Task 3: Docs touch

- [ ] Commit spec + plan; optional README one-liner if notes section fits
- [ ] `bun test packages/host apps/web && bun run typecheck`
