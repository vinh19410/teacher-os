---
title: "M1: E2E class operations CI (login → tạo lớp có lịch → buổi → check-in → reload)"
description: "Playwright E2E cho luồng vận hành lớp chạy xanh trên CI riêng (e2e.yml), dùng node boot shim thay cho alchemy dev."
status: pending
priority: P1
effort: 14h
tags: [e2e, playwright, ci, m1, better-auth, di-refactor]
created: 2026-08-22
---

# M1: E2E class operations CI

## Overview

Thêm E2E workflow CI cho luồng vận hành lớp (issue vinh19410/teacher-os#59, DOD `docs/project-roadmap.md:44`). Kiến trúc đã chốt sau spike (alchemy dev FAIL không credential Cloudflare → DEAD): **node boot shim** — API chạy dưới plain node via `buildApp(deps)` + libsql file DB + REAL better-auth (sau DI refactor nhỏ) + `@hono/node-server` :8000; web chạy `vite` dev :8001 với `VITE_SERVER_URL=http://localhost:8000`. Playwright 1.62.1 (pin exact qua pnpm catalog) trong package mới `apps/e2e`, script `e2e` (KHÔNG có script `test`), CI job riêng `.github/workflows/e2e.yml` — quality job và `ci.yml` không đổi.

**Data flow:**

```
Playwright (apps/e2e, chromium, workers:1)
  → UI actions trên http://localhost:8001 (vite dev, apps/web)
  → HTTP + cookie httpOnly better-auth.session_token (SameSite=None; Secure — Chromium coi localhost là trustworthy)
  → http://localhost:8000 (node boot: buildApp DI → real better-auth + bootstrap org + kernel routes)
  → libsql file DB (apps/e2e/local.db, migrate từ packages/db/src/migrations, wipe mỗi run)
```

**Facts then chốt (đã xác minh lại trên code):** buổi học KHÔNG sinh khi tạo lớp — sinh khi THÊM HỌC VIÊN vào lớp (`POST /api/students` với `classId`, `apps/server/src/routes/kernel.ts:242-309`, số buổi = `cls.sessionsTotal`); CSRF guard yêu cầu POST `/api/*` có `Origin === CORS_ORIGIN` nên web phải chạy đúng `http://localhost:8001`; `/schedule` render TẤT CẢ lessons theo cột thứ, không lọc tuần (`apps/web/src/routes/_auth/schedule.tsx:37-40`) → không cần week-nav; không có `data-testid` — dùng getByLabel/role/text.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `createAuth`/`getSessionUser` DI-refactored; real better-auth + libsql chạy được dưới plain node (round-trip test sign-up → session → kernel) | P1 |
| 2 | Package `apps/e2e` + node boot + playwright config; login smoke spec xanh local (retire rủi ro Secure-cookie cross-origin sớm) | P1 |
| 3 | Spec đầy đủ login → tạo lớp có lịch → thêm học viên → thấy 12 buổi → check-in → reload giữ data; xanh local | P1 |
| 4 | `.github/workflows/e2e.yml` xanh trên PR; contract test khóa workflow; root `pnpm test` KHÔNG chứa e2e | P1 |
| 5 | DOD roadmap `docs/project-roadmap.md:44` được tick kèm evidence (run URL) | P1 |

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Auth DI refactor + real better-auth round-trip dưới node | Pending | 3h | [Phase 1: Auth DI refactor](./phase-01-start.md) |
| 2 | apps/e2e package + node boot + playwright config + login smoke | Pending | 4h | [Phase 2: E2E package + boot + smoke](./phase-02-e2e-package-boot-smoke.md) |
| 3 | Full class-operations spec + e2e.yml + contract test + wiring | Pending | 5h | [Phase 3: Spec + CI workflow](./phase-03-class-operations-spec-ci.md) |
| 4 | Full gate xanh + CI evidence + DOD tick + issue evidence | Pending | 2h | [Phase 4: Full gate + DOD evidence](./phase-04-full-gate-dod-evidence.md) |

Dependencies: 1 → 2 → 3 → 4 (tuyến tính; boot cần createAuth mới, spec đầy đủ cần boot, evidence cần spec).

## Success Criteria

- [ ] `pnpm --filter e2e e2e` xanh local: spec chạy trọn kịch bản login → tạo lớp có lịch → thêm học viên → thấy 12 buổi "Sắp tới" → "Điểm danh" (barrier `opacity-60` trên /schedule chống race) → `page.reload()` → trạng thái completed sống sót trên /schedule + tab "Lịch học" của lớp thấy 1 "Đã học" + 11 "Sắp tới" (assert DOM post-reload, KHÔNG assert toast).
- [ ] Job `e2e` trong `.github/workflows/e2e.yml` xanh trên PR của branch này (không GitHub secrets, chỉ env literals).
- [ ] `pnpm install --frozen-lockfile && pnpm exec biome check . && pnpm test && pnpm check-types` xanh (root `test` script và `apps/web` `test` script KHÔNG đổi — contract `scripts/ci-workflow.test.mjs`).
- [ ] Round-trip test real better-auth dưới node xanh trong `pnpm test` (turbo task `test`); worker smoke local (alchemy dev boot + `/readyz` 200) xanh sau refactor lazy.
- [ ] `docs/project-roadmap.md:44` checkbox được tick với evidence link tới run e2e xanh; issue #59 có comment evidence.

## Risks Summary

| Risk | L | I | Mitigation | Phase |
|------|---|---|-----------|-------|
| Secure cookie cross-origin localhost:8001→8000 bị Chromium chặn | M | H | Smoke spec ở Phase 2 retire sớm; chỉ chromium; KHÔNG đổi cookie flags | 2 |
| better-auth drizzleAdapter + libsql drizzle chưa từng chạy trong repo | M | H | Round-trip test Phase 1 (sign-up thật + session thật) trước khi viết bất kỳ E2E nào | 1 |
| Selector Việt ngữ thay đổi / chip ambiguous | M | M | Scope locator vào dialog, `exact: true`; chuỗi UI quote exact trong phase files | 3 |
| Contract-drift CI workflow (secrets, triggers) | L | M | Mở rộng `scripts/ci-workflow.test.mjs` assert e2e.yml (exists, PR/push main+develop, no secrets) | 3 |
| Vite dev cold start chậm trên CI | L-M | M | `webServer.timeout: 120_000` + health-check URL polling; test `timeout: 120_000` + `retries: CI?1:0` (per-test layer, không chỉ webServer layer) |
| `biome check .` đỏ sau lần e2e đầu (report sinh ra; biome bỏ qua .gitignore) | M | H | `biome.json` files.includes thêm `!**/playwright-report`, `!**/test-results` ngay Phase 2 | 2 |
| e2e rơi vào `pnpm test` (browsers chưa install → quality job đỏ) | L | H | Package `e2e` KHÔNG có script `test`; turbo task tên `e2e` | 2 |

## Out of Scope (HOLD)

- Thêm spec cho invoice/assignment/report/settings (M2+).
- Visual regression, parallel sharding, multi-browser (firefox/webkit), mobile viewport.
- `storageState`/setup project auth (chỉ 1 kịch bản tuyến tính — UI sign-up trong spec là đủ).
- Đổi `ci.yml`, root `test` script, `apps/web` `test` script.
- Sửa các fake UI có sẵn (PageHead hardcode "3 lớp đang hoạt động", badge PRO...) — chỉ tránh assert vào chúng.
- Thêm `data-testid` vào apps/web.

## Unresolved Questions

- Không còn fork kiến trúc nào (spike đã quyết). Ghi chú nhỏ: `dotenv` trong `packages/auth/package.json` có vẻ không dùng sau refactor nhưng KHÔNG xóa (ngoài scope, tránh rủi ro tooling).

## Red Team Review

### Session — 2026-08-22
**Findings:** 12 (12 accepted, 0 rejected) — dedup từ 3 reviewer (Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Severity breakdown:** 3 Critical, 4 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Spec bước 6 assert badge "Đã học"/"Sắp tới" trên /schedule — trang này không render badge (chỉ ở tab "Lịch học" của $classId) → navigate là bắt buộc | Critical | Accept | Phase 3 |
| 2 | Locator `button.lesson-block` + tên học viên match 12 phần tử → strict mode violation; phải `.first()` | Critical | Accept | Phase 3 |
| 3 | Snippet Phase 1 đánh giá `createDb()`/auth tại module-eval — phá invariant lazy-bindings của worker entry (comment index.ts:7); không gate node nào phát hiện → thêm worker smoke gate + lazy getter | Critical | Accept | Phase 1 |
| 4 | Modal đóng là fire-and-forget (`void run(...)`); reload có thể abort POST đang bay → thêm barrier `opacity-60` trước reload | High | Accept | Phase 3 |
| 5 | Boot shim: thiếu SIGTERM/SIGINT handling; wipe bỏ sót WAL/SHM siblings; `reuseExistingServer` có thể false-green reuse dev server alchemy → signals + wipe 3 file + `reuseExistingServer: false` | High | Accept | Phase 2 |
| 6 | `biome.json` không tôn trọng .gitignore (`vcs.useIgnoreFile: false`) → `biome check .` đỏ sau lần e2e đầu (scan playwright-report) → thêm excludes tường minh | High | Accept | Phase 2 |
| 7 | `getByRole("tab")` không resolve — Tabs render button thuần không role → đổi sang `getByRole("button")` | High | Accept | Phase 3 |
| 8 | Test timeout 30s quá ngắn cho spec tuyến tính + cold vite CI; retries 0 vô nghĩa hóa trace on-first-retry → timeout 120s + `retries: CI?1:0` | Medium | Accept | Phase 2 |
| 9 | Contract test yếu hơn requirement: thiếu assert playwright install; regex secrets bỏ sót `secrets['X']`; không khóa permissions/pull_request_target → tăng cường cả 4 | Medium | Accept | Phase 3 |
| 10 | `@hono/node-server`/`tsx` không exact-pin (trái convention repo) → pin 2.1.1 / 4.23.12 (đã verify npm) | Medium | Accept | Phase 2 |
| 11 | Census thiếu 2 stakeholder: worker entry consumed bởi alchemy.run.ts; `topology-drift.test.mjs` grep `packages/auth/src/topology.ts` (giữ nguyên file) | Medium | Accept | Phase 1 |
| 12 | Boot shim bind 0.0.0.0 mặc định — expose auth thật ra LAN → `hostname: "127.0.0.1"` | Medium | Accept | Phase 2 |

Từ chối: 0 finding nào bị reject — tất cả đều có bằng chứng file:line; không finding nào cắt scope (lens Scope & Complexity không kích hoạt với 4 phases).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-e2e-package-boot-smoke.md, phase-03-class-operations-spec-ci.md, phase-04-full-gate-dod-evidence.md
- Decision deltas checked: 9 (spec bước 4-6 viết lại; lazy auth snippet; boot lifecycle; biome excludes; timeout/retries; contract assertions; exact pins; census additions; loopback bind)
- Reconciled stale references: 3 (note "verify role tab khi implement" → đã verify + sửa sẵn; note điều kiện "nếu URL vẫn /schedule" → navigate luôn bắt buộc; risk row EADDRINUSE/reuseExistingServer → fail-loud semantics)
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-08-22 (ak plan validate: PASS)
- **CLI gate:** `ak plan validate` exit 0 — plan directory hợp lệ.
- **Verification pass (Standard tier):** covered bởi Red Team session cùng ngày — 3 reviewer mang Fact Checker + Contract Verifier; ~30/30 file:line citations verified (Assumption Destroyer report), caller census `createAuth`/`getSessionUser` khớp 100% (2 + 1 call site + test stubs). Failed: 0 sau khi áp 12 accepted findings.
- **Open items resolved during validation:** `@playwright/test 1.62.1` tồn tại (npm view, 2026-08-22); `@hono/node-server 2.1.1`, `tsx 4.23.12` exact-pinned.
- **Interview questions: 0** — không còn decision point nào thay đổi implementation: fork kiến trúc duy nhất (alchemy dev vs node boot) đã quyết bởi spike (credential error, kết quả trong `reports/research-e2e-infra.md`); mọi selector/flow đã verify trực tiếp trên DOM/code. Pipeline chạy autonomous (ak:vibe) — không câu hỏi chặn nào còn mở.
- **Whole-Plan Consistency Sweep (post-validation):** reread 5 file; 0 contradiction chưa giải.

<!-- slug: m1-e2e-class-operations-ci -->
