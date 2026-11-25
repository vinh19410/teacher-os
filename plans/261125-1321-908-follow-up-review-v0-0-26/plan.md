---
title: "Follow-up review release v0.0.26 (#908): chặn sign-up/email tạo ADMIN/TEACHER trên unified LMS và xử lý M1–M4"
description: "Đóng lỗ hổng account squatting/pre-hijacking H1 trên unified LMS và khắc phục bốn hạng mục kỹ thuật M1–M4 từ báo cáo review v0.0.26."
status: completed
priority: P1
effort: 6h
issue: 908
branch: vinh19410/follow-up-review-release-v0.0.26-908
tags: [bugfix, security, auth, database, frontend]
blockedBy: []
blocks: []
created: 2026-11-25
---

# Follow-up review release v0.0.26 (#908)

## Overview

Đóng lỗ hổng bảo mật **H1** (chặn `POST /api/auth/sign-up/email` tạo mới tài khoản cho email trong `ADMIN_EMAILS`/`TEACHER_EMAILS` trên unified LMS) và xử lý dứt điểm 4 hạng mục non-blocking **M1–M4** từ báo cáo `plans/reports/code-reviewer-261124-0940-release-v0.0.26.md`, kèm kiểm chứng tự động (TDD) và kiểm thử E2E chọn lọc.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:** `H1` (`packages/auth`, `apps/server/src/auth-role-roundtrip.test.ts`, `apps/e2e`), `M1` (`reauth()` tại `apps/web`, `apps/student`, `apps/admin`), `M2` (`apps/lms/src/legacy-redirect.ts`), `M3` (`confirm-opening` `new_only` tại `apps/server/src/routes/kernel.ts`, `packages/api/src/contracts.ts`), `M4` (expression unique index + migration `0091` + catch 409 tại `packages/db`, `apps/server/src/routes/courses.ts`).
- **Explicit Non-Goals:** Không chạm `H2` (cutover domain runbook), `I1` (`emitNotifications` `sendIntervalMs`), `I2` (CORP `same-site` audio practice), `M5` (cron 06:00 VN), `M6` (version bump), và không mở rộng sang các root cause khác của `#890` ngoài `reauth()` (`M1`). Không thêm cờ bypass auth ở `CreateAuthInput`.
- **Handover-Ready Notice:** Mỗi phase được viết theo hợp đồng bàn giao `--advice` (Goal, Target files/symbols, Steps, Success criteria, Verify cơ học, và khối `## Failure Protocol` nguyên văn).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | H1: Chặn fail-closed mọi non-unified-OAuth user creation cho `ADMIN_EMAILS`/`TEACHER_EMAILS` khi `unifiedOrigins.length > 0` (kể cả thiếu/`"null"` `Origin` hay OAuth với `oauthApp !== "unified"`), trả `403 ROLE_SIGNUP_FORBIDDEN`; chặn thêm role-poisoning `adminEmails` ở nhánh fall-through `appRole === "student"`; giữ nguyên Google OAuth unified và parity E2E qua `/__e2e/seed-user`. | P1 |
| 2 | M1: `reauth()` gọi `authClient.signOut()` đồng bộ rồi chờ settle với timeout 2000ms (kèm `reauthEpoch` chống bfcache ghost-redirect và `clearTimeout` trong `finally`) trước khi `window.location.assign(...)` ở `apps/web`, `apps/student`, `apps/admin`. | P2 |
| 3 | M2: `resolveLegacyHostRedirect` giữ nguyên deep-link `returnUrl` bằng cách thêm prefix cổng (`/teacher`, `/student`, `/admin`) trên `/login` của host legacy với kiểm tra chống open-redirect (read-only decode, rebuild từ `raw` giữ nguyên `%26`/`%23`/`%25`, bỏ `returnUrl` độc hại khỏi 301) và ranh giới segment. | P2 |
| 4 | M3: `POST /api/classes/:id/confirm-opening` ở chế độ `new_only` phân biệt `note === undefined` (giữ `cls.openingNote`) với `note` có gửi (persist qua CAS kiểm `openingAnnouncementVersion` + `openingNote` khi `targets.length > 0`), đảm bảo `DB === email === response` và giữ no-op khi `targets.length === 0`. | P2 |
| 5 | M4: Thêm expression unique index `lower(trim(name))` cho `course_category` và `course` kèm migration `0091` khử trùng an toàn bằng `rowid` (2 lượt bảo hiểm, khớp cắt ngắn) và catch `isSqliteUniqueError` trả `409` ở 4 write handler trong `courses.ts` (và bỏ kiểm trùng thừa ở `PATCH /items/:id` khi không đổi tên/chuyển nhóm). | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: H1 — Block Privileged Email Sign-Up in Auth & Unit/Server Tests](./phase-01-start.md) | Completed |
| 2 | [Phase 2: H1 — E2E Seed Endpoint and Auth/Sign-Up Specs](./phase-02-h1-e2e-seed-and-specs.md) | Completed |
| 3 | [Phase 3: M1 & M2 — Bounded Reauth Sign-Out and Legacy Login ReturnUrl Rewrite](./phase-03-m1-m2-reauth-and-legacy-redirect.md) | Completed |
| 4 | [Phase 4: M3 — Confirm-Opening `new_only` Note Persistence](./phase-04-m3-confirm-opening-new-only-note.md) | Completed |
| 5 | [Phase 5: M4 — Course Catalog Unique Indexes, Migration 0091 & Full Verification](./phase-05-m4-courses-unique-index-and-verify.md) | Completed |

## Success Criteria

- [x] `POST /api/auth/sign-up/email` với email trong `ADMIN_EMAILS`/`TEACHER_EMAILS` trả `403 ROLE_SIGNUP_FORBIDDEN` (0 user row, 0 mail gửi) trên unified `Origin`, thiếu `Origin`, và `Origin: "null"`, cho cả email chưa tạo lẫn đã tồn tại; OAuth callback với `oauthApp !== "unified"` bị chặn; Google OAuth callback với `oauthApp === "unified"` vẫn gán đúng role `admin`/`teacher`; student signup vẫn trả `200`; mutation runtime trên `teacherEmails` có hiệu lực tức thời.
- [x] E2E dùng `POST /__e2e/seed-user` (không bypass bảo mật ở `@teacher-os/auth`), `web-email-verification.spec.ts` kiểm chứng qua `<AccountBlockedView />` tại `/teacher/dashboard`, 7 spec E2E liên quan xanh với port override `8100..8105`.
- [x] `reauth()` ở `apps/web`, `apps/student`, `apps/admin` gọi `signOut()` đồng bộ và chỉ gọi `window.location.assign` sau khi `signOut()` settle hoặc hết timeout 2000ms (kèm chống bfcache ghost-redirect qua `reauthEpoch`); tất cả unit test `reauth()` pass.
- [x] `resolveLegacyHostRedirect` rewrite an toàn `returnUrl` trên `/login` của host legacy (`app.`, `teacheros.io.vn`, `student.`, `admin.`), giữ nguyên `%26`/`%23`/`%25`, xử lý đúng `/students`, `/pay/`, double-prefix, cross-portal và loại bỏ `returnUrl` độc hại/open-redirect khỏi 301.
- [x] `confirm-opening` chế độ `new_only` giữ nguyên `cls.openingNote` nếu omit `note`, persist `input.note` qua CAS (khóa cả `openingAnnouncementVersion` và `openingNote`) khi `targets.length > 0`, đảm bảo `DB.openingNote === response.openingNote === email.teacherNote`, giữ nguyên version & `openingConfirmedAt`, giữ no-op khi `targets.length === 0`, và có test phủ thật nhánh CAS miss.
- [x] Migration `0093` (đánh lại số từ `0091` sau khi đồng bộ `origin/develop` `45cf263f` có `0091`/`0092`) khử trùng an toàn bằng `rowid` (kể cả ID `${orgId}:cat:*`, `"Name (2)"` có sẵn, tên sát ngưỡng 80/120 ký tự), tạo `course_category_org_name_uq` và `course_org_category_name_uq`; `/readyz` trả `200`; cả 4 endpoint ghi `/api/courses` trả `409` khi đụng `UNIQUE`; `PATCH /items/:id` chỉ kiểm trùng khi đổi tên hoặc đổi nhóm.
- [x] `pnpm exec biome check .`, `pnpm check-types` và toàn bộ test suite bị chạm pass.

## Red Team Review

### Session 1 — 2026-11-25
**Reviewers:** 3 parallel hostile `code-reviewer` lenses — Security Adversary (Fact Checker), Assumption Destroyer (Contract Verifier & Scope Auditor), Failure Mode Analyst (Flow Tracer).
**Findings (deduplicated):** 13 (3 Critical, 6 High, 4 Medium — 12 accepted/scoped, 1 rejected).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | H1 OAuth `isOAuthCallback` quá rộng (`oauthApp !== null`) + guard `adminEmails` bị bó trong `unifiedOrigins.length === 0` gây role-poisoning `admin`→`student` | Critical | Accept | Phase 1 |
| 2 | Migration `0091` dùng `substr(id, 1, 6)` trùng 100% trên ID seed `${orgId}:cat:*` & cắt ngắn sát 80/120 ký tự có thể làm nổ `CREATE UNIQUE INDEX` | Critical | Accept | Phase 5 |
| 3 | E2E `web-email-verification.spec.ts` giả định sai `/login?blocked=1` & `BlockedAccountCard`; thực tế `apps/web` render `<AccountBlockedView />` tại `/teacher/dashboard` | Critical | Accept | Phase 2 |
| 4 | M4 SQLite `lower(trim(name))` lệch Unicode/đa khoảng trắng so với `normalizeCourseNameKey()`, và `PATCH /items/:id` kiểm trùng kể cả khi chỉ đổi `isActive` | High | Accept (scoped) | Phase 5 |
| 5 | M3 CAS `new_only` thiếu `eq(classTable.openingNote, cls.openingNote)`, `.default("")` xóa trắng note khi omit, và test CAS bước 3 là phantom test | High | Accept | Phase 4 |
| 6 | M1 `Promise.resolve().then(() => authClient.signOut())` trì hoãn gọi `signOut()` sang microtask, phá assertion đồng bộ | High | Accept | Phase 3 |
| 7 | M1 `reauth()` async IIFE hở bfcache ghost-redirect + `apps/web/src/lib/reauth.ts` thiếu `resetReauthForTests()` & guard `addEventListener` | High | Accept | Phase 3 |
| 8 | M2 `rewriteLegacyLoginSearch` double-decode trước khi rebuild làm hỏng `%26`/`%23`/`%25`; cần parse từ `raw` và loại bỏ `returnUrl` độc hại ở 301 | High | Accept | Phase 3 |
| 9 | H1 `auth-admin-signup.test.ts` chia sẻ 1 `ctx` (`beforeAll`) đã có `root@example.com` → test mới nhận `422` thay vì `403` | High | Accept | Phase 1 |
| 10 | H1 `hooks.before` trả `403 ROLE_SIGNUP_FORBIDDEN` có allowlist-oracle tradeoff (đóng claimed/unclaimed và admin/teacher oracle nhưng phân biệt allowlisted vs public) | High | Accept (documented tradeoff) | Phase 1 |
| 11 | H1 Bẫy snapshot `input.teacherEmails` trong `createAuth()` sẽ phá `POST /__e2e/teacher-emails` (mutate tại chỗ bằng `.splice`) | Medium | Accept | Phase 1 |
| 12 | Phase 2 thiếu `emailVerified ? 1 : 0`, thiếu `Origin: WEB_ORIGIN` trên `sign-in/email`, quên gỡ unused `createClient` ở `admin-screenshots.mjs`, Verify Task 2.1 sai số file (10 file / 7 caller) | Medium | Accept | Phase 2 |
| 13 | Đổi `HOSTNAME = "::"` trong `apps/e2e/src/boot.ts:39` về `127.0.0.1` | Medium | Reject (modified) | Phase 2 (giữ dual-stack `::` cho `localhost` CI, chỉ thêm guard loopback `Host` header trên `/__e2e/seed-user`) |

### Whole-Plan Consistency Sweep (Red Team Session 1)
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-h1-e2e-seed-and-specs.md`, `phase-03-m1-m2-reauth-and-legacy-redirect.md`, `phase-04-m3-confirm-opening-new-only-note.md`, `phase-05-m4-courses-unique-index-and-verify.md`
- Decision deltas checked: 12
- Reconciled stale references: 12
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-25
**Trigger:** Autonomous `/ak-vibe --ship --beta --advice` pre-implementation validation gate.

### Verification Results
- **Tier:** Full (5 phases — Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier)
- **CLI format check:** `ak plan validate` -> `valid: true`, `errors: null`
- **Claims checked:** 48 (across all 5 phases via 3 independent red-team reviewers + controller spot checks)
- **Verified:** 48 | **Failed:** 0 (after applying all 12 red-team remediations above) | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-h1-e2e-seed-and-specs.md`, `phase-03-m1-m2-reauth-and-legacy-redirect.md`, `phase-04-m3-confirm-opening-new-only-note.md`, `phase-05-m4-courses-unique-index-and-verify.md`
- Decision deltas checked: 12
- Reconciled stale references: 0 remaining
- Unresolved contradictions: 0

<!-- slug: 908-follow-up-review-v0-0-26 -->
