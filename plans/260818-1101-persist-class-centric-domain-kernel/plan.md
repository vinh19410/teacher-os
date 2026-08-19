---
title: "Persist class-centric domain kernel"
description: "Persist org/class/enrollment kernel trên D1, giữ 13 màn qua adapter, rồi bóc module đến khi mock runtime chết."
status: in-progress
priority: P1
effort: "12-16d"
issue: 9
branch: develop
tags: [feature, backend, database, api, frontend]
blockedBy: []
blocks: []
created: 2026-08-18
---

# Persist class-centric domain kernel

## Overview

13 màn UI sống trên `useReducer` + `seedData`. D1 chỉ 4 bảng Better-Auth. Plan này persist kernel class-centric trước, giữ shape `MockData` qua adapter, rồi bóc từng module. Không persist nguyên mock. Không vá stub.

Authority: `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md` (user-confirmed 2026-08-17).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Kernel D1: org trống + membership `teacher` + student/class/syllabus/enrollment/package | P1 |
| 2 | 13 màn không rewrite UI wave 0; adapter map kernel → `MockData` | P1 |
| 3 | Bóc module 1→8 đến khi 13 màn đọc/ghi D1, scoped org | P1 |
| 4 | 1 parent + 9 GitHub issue tương ứng Wave 0–8 | P1 |

## 7 invariant (khóa)

| # | Invariant | Hệ quả |
|---|---|---|
| 1 | Mọi domain row có `orgId`. `user` ≠ GV profile. Role bắt buộc = `teacher` | Query filter membership. Không gate `owner` |
| 2 | Dạy xảy ra trong `class`. 1:1 = class + 1 enrollment | `lesson.classId` NOT NULL khi có bảng lesson |
| 3 | `student` là person. Không cột pkg | Gói ở `session_package.enrollmentId` |
| 4 | Roster = `enrollment` (unique classId+studentId) | Cấm JSON `student_ids` trên class |
| 5 | `syllabus_lesson` ≠ `lesson` | Không gộp id/table |
| 6 | Package = entitlement. `done`/`remaining` derive từ lesson completed | Cấm cột `done` là source of truth |
| 7 | `class.sessionsDone` derive, không ghi lúc check-in | Khớp test hiện tại |

Lock thêm: org mới trống; wave 7 persist report/notif/comment_bank; package-on-enrollment.

## Phases

| # | Phase | Wave | Status |
|---|-------|------|--------|
| 1 | [Wave 0 Kernel](./phase-01-start.md) | 0 | Completed |
| 2 | [Wave 1 Students peel](./phase-02-wave-1-students-peel.md) | 1 | Completed |
| 3 | [Wave 2 Syllabus peel](./phase-03-wave-2-syllabus-peel.md) | 2 | Completed |
| 4 | [Wave 3 Classes peel](./phase-04-wave-3-classes-peel.md) | 3 | Completed |
| 5 | [Wave 4 Schedule persist](./phase-05-wave-4-schedule-persist.md) | 4 | Completed |
| 6 | [Wave 5 Tuition persist](./phase-06-wave-5-tuition-persist.md) | 5 | Completed |
| 7 | [Wave 6 Assignments persist](./phase-07-wave-6-assignments-persist.md) | 6 | Completed |
| 8 | [Wave 7 Reports + notifs + comment bank](./phase-08-wave-7-reports-notifs-comment-bank.md) | 7 | Completed |
| 9 | [Wave 8 Remove mock runtime](./phase-09-wave-8-remove-mock-runtime.md) | 8 | Pending |

DAG GitHub: `0 → {1,2,3}` độc lập; `3 → 4 → 5`; `3 → 6 → 7` (serial trên `grade-modal.tsx`); `3 → 7` cũng cần wave 6 xong; `8` sau `4+5+6+7`. 1+2+3 **không** block lẫn nhau. 1+2+3 có thể 1 PR / 3 commit. Serial nếu 1 agent. Không song song 2 wave trên `schema/index.ts`, `apps/server/src/app.ts` (mount; `index.ts` chỉ là worker entry), `routes/kernel.ts`, `packages/api/src/contracts.ts`, `apps/web/src/lib/repos/kernel.ts`, `data-store-reducer.ts`, `grade-modal.ts`, migration journal (`packages/db/src/migrations/meta/_journal.json` — wave merge sau regenerate `db:generate` trên journal đã merge).

## Execution notes

- Mutation = POST action. CORS giữ `GET|POST|OPTIONS` + `Content-Type`/`Authorization` (`apps/server/src/app.ts:87-95`; CSRF Origin guard trong `routes/kernel.ts:38-49` — router mới mount qua `kernel.route()` để inherit). Không PATCH. Không `X-Org-Id`.
- `packages/api` tạo tay (Zod). Cấm đổi `bts.jsonc` `api`. `check-types` trên `packages/api` (package mới). Không sửa `.github/workflows/ci.yml`.
- Bootstrap middleware trên **mọi** `/api/*` trừ `/api/auth/*`. Idempotent. Unique membership `(orgId, userId)`. Re-read nếu race. Không `unique(userId)` toàn cục. Không hook `user.create`. Không `/api/me`.
- Fetch web: `credentials: 'include'`.
- HV không class: person only, adapter remaining=0. `classId`: person + enrollment + `session_package`. Client không gọi `POST .../enrollments` (enroll HV cũ = stub cấm).
- **Runtime wave 0:** `seedData` = fixture test (`data-store-reducer.test.ts`, 23 case). Collection chưa peel = `[]`. Banner copy **không** đổi đến wave 8.
- Provider **không render children** đến khi GET `/api/kernel` settle. Dispatch kernel = command bus (POST → id server → refetch). 26 file import `@/lib/data-store`: 12 route (không settings) + 11 modal + lesson-modal + topbar + app-shell.
- Wave 0 verify `alchemy dev` apply `migrationsDir`. Isolation test phải chạy trên server handler (`apps/server` test script) hoặc đánh dấu BLOCKED — không đếm CI web-only là đủ.
- Quality: `pnpm test && pnpm check-types && pnpm run check`.

## Non-goals

Vá stub (tạo HĐ, gửi report, Zalo, GCal, Pro 99k, enroll HV cũ, tạo buổi, tạo bài). Parent login. tRPC. Dark mode. Sửa StatCard hardcoded. UI org/invite. Đổi historical `plans/**`.

## Dependencies

- Stack: Hono + D1 + Drizzle + Better-Auth + Alchemy. Không đổi.
- Evidence: `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md`, `plans/reports/scout-2026-08-18-persist-class-centric-kernel.md`, `plans/reports/researcher-2026-08-18-backend-d1-auth.md`
- Prior plans: convert UI, test suite, enroll `classId` — tất cả `completed`. Không block.

## Success Criteria

- [ ] Login user mới: students/classes/syllabi rỗng; membership `role=teacher`
- [ ] Tạo HV + lớp + enroll + syllabus + assign → hard refresh còn trên UI và D1
- [ ] Schema: 0 cột `student.pkg_*`, 0 JSON `student_ids` trên class
- [ ] Wave 4: `lesson.classId` NOT NULL; check-in không UPDATE `session_package.done`
- [ ] Org A không đọc class org B
- [ ] Wave 8: 0 `seedData` / `useReducer(reducer` trên app path (fixture test được giữ)
- [ ] 9 GitHub issue Wave 0–8 + 1 tracker, label `ready to review`

## GitHub issues

Tracker: [#9](https://github.com/vinh19410/teacher-os/issues/9) · label `ready to review` + `enhancement`

| Wave | Issue |
|------|-------|
| 0 | [#10](https://github.com/vinh19410/teacher-os/issues/10) |
| 1 | [#11](https://github.com/vinh19410/teacher-os/issues/11) |
| 2 | [#12](https://github.com/vinh19410/teacher-os/issues/12) |
| 3 | [#13](https://github.com/vinh19410/teacher-os/issues/13) |
| 4 | [#14](https://github.com/vinh19410/teacher-os/issues/14) |
| 5 | [#15](https://github.com/vinh19410/teacher-os/issues/15) |
| 6 | [#16](https://github.com/vinh19410/teacher-os/issues/16) |
| 7 | [#17](https://github.com/vinh19410/teacher-os/issues/17) |
| 8 | [#18](https://github.com/vinh19410/teacher-os/issues/18) |

## Open questions

None. Advise đã lock org trống / wave 7 persist / role `teacher`.

## Red Team Review

### Session — 2026-08-18
**Findings:** 15 unique sau dedup (8 accepted, 7 rejected)
**Severity breakdown:** 4 Critical accepted, 4 High accepted, 0 Medium accepted
**Reports:** `reports/red-team-security-adversary.md`, `red-team-failure-mode-analyst.md`, `red-team-assumption-destroyer.md`, `red-team-scope-complexity-critic.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Provider render trước kernel settle → detail `notFound()` | Critical | Accept | Phase 1 |
| 2 | Dispatch sync không persist / id lệch | Critical | Accept | Phase 1 |
| 3 | Wave 1 đổi modal POST vs contract + class detail | Critical | Accept | Phase 2 |
| 4 | CSRF: SameSite=None + CORS fail-open + POST | Critical | Accept | Phase 1 |
| 5 | Nested id / `classId` không bind parent+org | High | Accept | Phase 1 |
| 6 | Lesson thiếu `enrollmentId` (1:2 + `l.sid`) | High | Accept | Phase 5 |
| 7 | Bootstrap chỉ trên `/api/kernel` chết wave 8 | High | Accept | Phase 1, 9 |
| 8 | Wave 6∥7 cùng `grade-modal`; wave 7 sót read site | High | Accept | Phase 7–8 |
| 9 | `X-Org-Id` / `/api/me` / unique(userId) / banner wave 0 | High | Accept (cắt extras) | plan + Phase 1 |
| 10 | Đổi dashboard sang ngày dương lịch | High | Accept (giữ `day===2`) | Phase 5 |
| 11 | Public `POST enrollments` = enroll HV cũ | High | Accept (cấm client) | Phase 1, 4 |
| 12 | `check-types` db + sửa `ci.yml` | Medium | Accept (chỉ `packages/api`) | plan |
| 13 | Email chưa verify + role teacher | Medium | Reject | v1 lock; mọi teacher cùng org |
| 14 | Mark-paid overwrite HĐ đã thu | Medium | Reject | khớp mock hiện tại |
| 15 | Comment bank là nhận xét HV | Medium | Reject as cut | persist vẫn đúng lock |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, phase-01…phase-09
- Decision deltas checked: 12 (loading gate, command bus, middleware bootstrap, no X-Org-Id, no /api/me, enrollmentId, day===2, no client enrollments, unique(orgId,userId), 6→7 serial, wave 7 read sites, caller counts)
- Reconciled stale references: X-Org-Id, /api/me, unique(userId), 26 seed tests, 13-route import, POST enrollments, dashboard Date()
- Unresolved contradictions: 0

### Session — 2026-08-19 (Wave 2 scope re-verification, scoped phase-03)
**Findings:** 11 unique sau dedup (2 reviewers: Security Adversary + Assumption Destroyer, tier Light — Fact Checker) — 7 accepted, 2 resolved-by-pattern, 2 rejected
**Severity breakdown:** 2 Critical accepted, 4 High accepted, 5 Medium (3 accepted / 2 rejected)
**Key trigger:** 2 reviewer độc lập phát hiện premise phase-03 stale — seed đọc chết từ wave 0; wave 1 (PR #20) merge giữa chừng cấp pattern precedent. Disposition chi tiết: `phase-03-wave-2-syllabus-peel.md` → "Red Team Dispositions".

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Premise stale — peel đã xong wave 0, "ngừng đọc seed" no-op | Critical | Accept | Phase 3 (rewrite scope = read peel pattern wave 1) |
| 2 | "totalLessons server-side" mâu thuẫn contract lock + pinned test | Critical | Accept | Phase 3 (derive trong mapSyllabi; deviation ghi lên issue #12) |
| 3 | repos/syllabus.ts dual path desync | High | Accept | Phase 3 (hook trên store cache) |
| 4 | Rewire modal write dính contract pin | High | Accept | Phase 3 (do-not-modify write) |
| 5 | "CRUD" không deliver (không delete/rename) | Medium | Accept | Phase 3 (restatement) |
| 6 | Thiếu test cross-org nested write | Medium | Accept | Phase 3 (server tests) |
| 7 | Serial conflict repos/kernel.ts wave1∥wave2 | Medium | Resolved | Wave 1 merged PR #20; wave 2 rebase |
| 8 | Không GET /syllabi/:id; GET /syllabi = snapshot | Medium | Resolved | By pattern (reads qua store hook) |
| 9 | Input không bound trên 6 write endpoints | Medium | Reject | Out of scope wave 2 (surface wave 0); follow-up ghi trong Phase 3 Security |
| 10 | PageHead lead hardcoded | Medium | Reject | Wave 1 precedent + wave-8 copy lock |
| 11 | AssignSyllabusModal 2 mounts + class consumers | Medium | Accept | Phase 3 (do-not-modify list) |

### Session — 2026-08-19 (Wave 4 scope re-verification, scoped phase-05)
**Findings:** 12 unique sau dedup (2 reviewers: Security Adversary + Assumption Destroyer, tier Light — Fact Checker) — 12 accepted, 0 rejected
**Severity breakdown:** 2 Critical accepted, 4 High accepted, 6 Medium accepted
**Key trigger:** Phase file viết theo tree cũ — cả read path (KernelSnapshot/loadSnapshot/KernelSlice/kernel-loaded payload không có lessons) lẫn write path (`check-in`/`cancel-lesson` không có trong `KERNEL_WRITE_TYPES`) đều thiếu; theo file list cũ, check-in local-only và `data.lessons` stay `[]` — fail im qua quality gate. Disposition chi tiết: `phase-05-wave-4-schedule-persist.md` → "Red Team Dispositions".

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Read path không có lessons ở 4 tầng — `data.lessons` stay `[]` | Critical | Accept | Phase 5 (Architecture 1, Steps 3) |
| 2 | `check-in`/`cancel-lesson` không trong `KERNEL_WRITE_TYPES` → local-only | Critical | Accept | Phase 5 (Architecture 2, Steps 4) |
| 3 | Origin/CSRF guard per-router — router riêng mất guard | High | Accept | Phase 5 (endpoint trong kernelRoutes + guard test) |
| 4 | Thiếu transition matrix; `cancelled→completed` lọt | High | Accept | Phase 5 (upcoming-only, 409) |
| 5 | Remaining derive không định danh chỗ; multi-enrollment ill-defined | High | Accept | Phase 5 (mapStudents, theo enrollment package hiển thị) |
| 6 | sessionsDone pass-through cột lưu; unit 1:2 undefined | High | Accept | Phase 5 (mapClasses, distinct day,time) |
| 7 | Enum "4 consumer" sai — 5 file/6 site (sót schedule.tsx:85) | Medium | Accept | Phase 5 (Architecture 3) |
| 8 | Test lock trích dẫn sai; 5 test liên quan | Medium | Accept | Phase 5 (Steps 6) |
| 9 | Binding lesson↔enrollment không ràng buộc | Medium | Accept | Phase 5 (handler validate) |
| 10 | Schema thiếu FK/index convention | Medium | Accept | Phase 5 (schema block) |
| 11 | Name collision `lessonUpsertSchema`; body POST undefined | Medium | Accept | Phase 5 (body `{}`, enum riêng) |
| 12 | Isolation test không nêu harness | Medium | Accept | Phase 5 (server kernel.test.ts mirror 450-545) |

### Session — 2026-08-19 (Wave 5 scope re-verification, scoped phase-06)
**Findings:** 16 raw → 9 unique sau dedup (2 reviewers: Security Adversary +
Assumption Destroyer, tier Light — Fact Checker) — 8 accepted, 1 rejected
**Severity breakdown:** 3 Critical accepted, 3 High accepted, 2 Medium accepted,
1 High rejected as pre-existing/out-of-scope
**Reports:** `reports/red-team-wave5-security-adversary.md`,
`reports/red-team-wave5-assumption-destroyer.md`
**Key trigger:** Phase-06 viết theo tree cũ: invoice không có trong
`KernelSnapshot`/`KernelSlice`/`kernel-loaded`; `mark-invoice-paid` bị test pin
local-only; router invoice riêng không được mount và sẽ mất guard của
`kernelRoutes`. Disposition chi tiết: `phase-06-wave-5-tuition-persist.md` →
"Red Team Dispositions".

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Thiếu full invoice hydrate path; 3 consumer shared-store | Critical | Accept | Phase 6 (snapshot + GET reuse loadInvoices) |
| 2 | `mark-invoice-paid` local-only | Critical | Accept | Phase 6 (command bus + refetch) |
| 3 | Router invoice riêng không mount/mất Origin guard | Critical | Accept | Phase 6 (endpoint trong kernelRoutes) |
| 4 | Schema/DTO thiếu FK/index/order/adapter mapping | High | Accept | Phase 6 (full schema + explicit DTO) |
| 5 | Auth/org binding + malformed relation chưa khóa | High | Accept | Phase 6 (fail-closed ctx + same-org join) |
| 6 | Method/replay semantics mơ hồ | High | Accept | Phase 6 (strict bounded body; giữ paid overwrite) |
| 7 | AddInvoiceModal no-op chưa contract-lock | Medium | Accept | Phase 6 (no-create regression test) |
| 8 | Test plan thiếu isolation/guard/reload matrix | Medium | Accept | Phase 6 (real handler tests) |
| 9 | Classless student hiển thị 0/0/NaN | High | Reject | Pre-existing Tuition display; ngoài acceptance issue #15 |

### Session — 2026-08-19 (Wave 6 pre-implementation, scoped phase-07)
**Findings:** 13 unique sau dedup (4 reviewers, tier Full: Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic) — 13 accepted, 0 rejected
**Severity breakdown:** 2 Critical accepted, 4 High accepted, 7 Medium accepted

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Read path unplanned — assignments không tới `data.assignments` (snapshot/payload không có) | Critical | Accept | Phase 7 (assignments ride kernel snapshot; GET list convenience; không GET /:id) |
| 2 | Write path unplanned — `grade-assignment` ngoài `KERNEL_WRITE_TYPES` → local no-op; modal close trước await | Critical | Accept | Phase 7 (bus + kernelCommand + async modal) |
| 3 | Router mới thoát CSRF Origin guard (guard sống trong `kernelRoutes`) + thiếu `app.ts` mount | High | Accept | Phase 7 (mount `kernel.route()` trong kernel chain) |
| 4 | "Song song wave 4/5" đụng migration journal + barrels; lock `server/src/index.ts` stale | High | Accept | Phase 7 + plan DAG/notes (serial surfaces; regenerate migration) |
| 5 | Schema bỏ convention: thiếu `createdAt`, org index, FK cascade (studentId FK = backstop "không đổi chủ") | High | Accept | Phase 7 (Architecture DDL đầy đủ) |
| 6 | Half-band trap: copy convention `.int()` reject mọi điểm 6.5 | High | Accept | Phase 7 (`gradeScoresSchema` strict float 0–9) |
| 7 | POST grade không ghi `status='graded'` — criterion fail silent | Medium | Accept | Phase 7 (một UPDATE scores+status; test assert cả hai) |
| 8 | Thiếu 401 guard convention + test cross-org | Medium | Accept | Phase 7 (guard từng handler + test bắt buộc) |
| 9 | `packages/api` contracts thiếu khỏi file list | Medium | Accept | Phase 7 (Related Code Files) |
| 10 | Adapter `studentId → sid` + `due` format + consumer `students/$studentId.tsx` không liệt kê | Medium | Accept | Phase 7 (Context Links + mapAssignments) |
| 11 | Feedback modal discarded nhưng không lock — nguy cơ thêm cột đụng wave 7 | Medium | Accept | Phase 7 (Requirements: cấm cột, defer wave 7) |
| 12 | Module trống vĩnh viễn ngoài test — wiring chết không detect được | Medium | Accept | Phase 7 (bước 6: test qua `mapKernelSnapshot` thật) |
| 13 | `repos/kernel.ts` response contract (`json.id` vs `{ok:true}`) không chỉ định | Medium | Accept | Phase 7 (response `{ ok: true }` pin) |

### Whole-Plan Consistency Sweep — 2026-08-19 (wave 6)
- Files reread: `plan.md`, phase-05, phase-06 (head), phase-07 (sau edit), phase-08
- Decision deltas checked: reads qua snapshot (không GET /:id — khớp wave-2 resolution); mount qua `kernel.route()`; `.int()` cấm cho scores; feedback defer khớp phase-08 `comment_bank`; serial surfaces cập nhật DAG
- Reconciled stale references: `server/src/index.ts` (worker entry) → `app.ts` mount + `routes/kernel.ts` guard, ở DAG lock + execution notes
- Unresolved contradictions: 0

### Session — 2026-08-19 (Wave 7 scope re-verification, scoped phase-08)
**Findings:** 14 evidence-backed trước dedup (2 reviewers: Security Adversary + Assumption Destroyer, tier Light) — 9 accepted themes, 3 scope-expansion themes rejected, overlap deduped in phase dispositions.
**Severity breakdown:** 1 Critical, 7 High, 6 Medium before dedup.
**Reports:** `reports/red-team-wave7-security-adversary.md`, `reports/red-team-wave7-assumption-destroyer.md`
**Key trigger:** Phase 8 predated the Wave 6 kernel snapshot/command-bus shape; read sites were already correct but snapshot/contracts did not hydrate reports/notifs/commentBank.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | 3 list không vào kernel hydration path | Critical | Accept | Phase 8 architecture/tests |
| 2 | Grade/comment dual-write thiếu ordering + partial UX | High | Accept | Phase 8 write flow/tests |
| 3 | Comment identity/duplicate semantics chưa khóa | High | Accept | Phase 8 DTO/UI/tests |
| 4 | Report DTO + same-org student relation thiếu | High | Accept | Phase 8 loader/contracts |
| 5 | PII premise sai với free-text feedback | High | Accept | Phase 8 security |
| 6 | Migration/order/contracts chưa đủ cụ thể | Medium | Accept | Phase 8 schema/DTO |
| 7 | Report no-op chưa pin cả 2 action + 2 callers | Medium | Accept | Phase 8 tests |
| 8 | Comment input không strict/bounded | Medium | Accept (bounded input only) | Phase 8 API |
| 9 | Global role enforcement / pagination / demo chrome | High/Medium | Reject for Wave 7 | No public role/import surface; scope expansion |

### Whole-Plan Consistency Sweep — 2026-08-19 (wave 7)
- Files reread: `plan.md`, phase-01…phase-09 after scoped edits.
- Decision deltas checked: kernel hydration, DTO identity, same-org report join, ordered two-step grade/comment, comment commit-vs-refresh ACK, duplicate append, PII/input bounds, no-op report paths, no mark-read.
- Reconciled stale references: Phase 8 `GET 3 list` without provider wiring; missing comment-bank repo; stale read-site edits; PII-as-template premise.
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Full (9 phases)
- **Claims checked:** 22
- **Verified:** 20 | **Failed:** 0 | **Unverified:** 2 (`alchemy dev` apply migrate — chưa chạy live; CORS fail-open behavior — đọc source `index.ts:10-18` đủ để thêm Origin check)
- Open questions asked: 0 (advise + red-team đã lock; không còn decision user)

### Whole-Plan Consistency Sweep
- Unresolved contradictions: 0

### Verification Results — 2026-08-19 (wave 2 pre-implementation)
- **Tier:** Light (phase-03 scoped; parent Full tier 2026-08-18 còn hiệu lực)
- **Claims checked:** 11 | **Verified:** 11 | **Failed:** 0 | **Unverified:** 0
- Key verifications: routes + 5 modals tồn tại; 6 write actions trong `KERNEL_WRITE_TYPES` (`repos/kernel.ts:15-25`) + endpoints org-scoped mounted (`apps/server/src/routes/kernel.ts:424-579`); `seedData` 0 import runtime (chỉ `mock-data.ts:186` + tests); provider hydrate `GET /api/kernel` (`data-provider.tsx:67-87`); adapter derive `totalLessons` từ tree (mapKernelSnapshot trong `repos/kernel.ts`, pin `repos/kernel.test.ts:161`); modal write pins (`kernel-runtime.contract.test.ts:51-66`); wave 1 precedent merged (PR #20: `repos/students.ts` + `use-students.ts` + `students-peel.contract.test.ts`).
- Open questions asked: 0 (deviation "totalLessons server-side → mapping-side" giải quyết bằng contract lock + pinned test + wave-1 precedent; ghi rõ lên issue #12)

### Whole-Plan Consistency Sweep — 2026-08-19 (wave 2)
- Files reread: `plan.md`, phase-02, phase-03 (sau edit), phase-04
- Decision deltas checked: scope phase-03 = read peel; totalLessons mapping-side; store slice `syllabi` sống đến wave 3+; write path đóng băng
- Reconciled stale references: "ngừng đọc data.syllabi seed" (phase-03 cũ), "Recompute totalLessons server-side" (phase-03 cũ), "Được gộp 1 PR / 3 commit với wave 1+3" (wave 1 đã merge riêng PR #20 — wave 2 PR độc lập)
- Unresolved contradictions: 0

### Verification Results — 2026-08-19 (wave 4 pre-implementation)
- **Tier:** Light (phase-05 scoped; parent Full tier 2026-08-18 còn hiệu lực)
- **Claims checked:** 13 | **Verified:** 13 | **Failed:** 0 | **Unverified:** 0
- Key verifications (Fact Checker, 2 reviewer độc lập khớp nhau): `repos/lessons.ts` không tồn tại (Create, không Modify); `KERNEL_WRITE_TYPES` 9 type, không có check-in/cancel (`repos/kernel.ts:18-28`); `KernelSnapshot` không có lessons (`contracts.ts:144-150`); `loadSnapshot` không SELECT lesson (`routes/kernel.ts:120-263`); `kernel-loaded` payload Pick 3 key (`data-store-reducer.ts:21-23`); Origin guard per-router `kernel.use` (`routes/kernel.ts:38-49`); `lessonUpsertSchema` là syllabus contract (`contracts.ts:59-65`); `mapStudents` hardcode `done:0/remaining:total` (`repos/students.ts:52-53`); `mapClasses` pass-through `sessionsDone` với comment "until Wave 4" (`repos/classes.ts:15-16`); reader `l.sid` 5 file/6 site gồm `schedule.tsx:85`, `classes/$classId.tsx:59-60,180`; migration convention + server test harness tồn tại (drizzle-kit `db:generate`, alchemy `migrationsDir`, `apps/server` `vitest run` + kernel.test.ts:450-545 pattern); test lock thật là "increments s1 package math" 30-57 pin `pkg.done+1`.
- Open questions asked: 0

### Whole-Plan Consistency Sweep — 2026-08-19 (wave 4)
- Files reread: `plan.md`, phase-01, phase-02, phase-03, phase-04, phase-05 (sau edit), phase-06…phase-09
- Decision deltas checked: endpoint lesson sống trong kernelRoutes (không router riêng, không đụng app.ts); read qua kernel snapshot (không fetch riêng — giữ provider gate wave 0); remaining derive mapping-side tại mapStudents (khớp precedent wave 2 totalLessons); sessionsDone distinct (day,time); transition matrix upcoming-only; body `{}`; `schedule.tsx` zero-change
- Reconciled stale references (phase-05 cũ): "Modify repos/lessons.ts" → Create; "Create/Modify routes/lessons/" → endpoint trong kernelRoutes; "4 consumer" → 5 file/6 site; "data-store-reducer.ts:122-136" → 142-157; "test 30-47 sessionsDone" → test 30-57 pkg.done counter; "Derive trong API/adapter" → định danh mapStudents/mapClasses; bỏ "Modify schedule.tsx"
- Cross-phase checks: phase-06 (wave 5 tuition) + phase-07 (wave 6 assignments) không đọc `session_package.done` cột (đã verify schema không có cột) — derive mapping-side không phá; phase-09 (wave 8) gỡ mock runtime vẫn giữ fixture test; invariant 2/5/6/7 không đổi
- Unresolved contradictions: 0

### Verification Results — 2026-08-19 (wave 5 pre-implementation)
- **Tier:** Light (phase-06 scoped; parent Full tier 2026-08-18 còn hiệu lực)
- **Claims checked:** 14 | **Verified:** 14 | **Failed:** 0 | **Unverified:** 0
- Key verifications: `Invoice` UI shape dùng `sid` (`mock-data.ts:45-55`);
  invoice có 3 consumer (`tuition.tsx:140-141`,
  `students/$studentId.tsx:74-76`, `dashboard.tsx:160-166`); runtime khởi tạo
  `invoices=[]` và snapshot payload không hydrate collection
  (`data-store-reducer.ts:21-23,128-137`); `KernelSnapshot`/`KernelSlice` không có
  invoice (`contracts.ts:174-181`, `repos/kernel.ts:17-20`);
  `mark-invoice-paid` không có trong whitelist và test pin local-only
  (`repos/kernel.ts:22-34`, `repos/kernel.test.ts:306-315`); Origin/JSON guard
  per-router (`routes/kernel.ts:37-51`); app chỉ mount `kernelRoutes`
  (`app.ts:83-100`); unauth bootstrap tiếp tục và handler phải fail-closed
  (`app.ts:44-50`, `routes/kernel.ts:303-306`); modal submit close-only
  (`add-invoice-modal.tsx:20-25`); paid replay overwrite method được pin
  (`data-store-reducer.test.ts:93-100`); migration + real handler harness tồn tại
  (`drizzle.config.ts:8-13`, `kernel.test.ts:1-42`).
- Open questions asked: 0 (canonical read chọn shared snapshot + GET helper reuse
  theo 3 consumer; paid overwrite là verified sticky decision, không đảo).

### Whole-Plan Consistency Sweep — 2026-08-19 (wave 5)
- Files reread: `plan.md`, phase-01…phase-09 (phase-06 sau edit)
- Decision deltas checked: invoice canonical shared snapshot; GET reuse
  `loadInvoices`; command bus write; endpoint trong guarded `kernelRoutes`;
  strict bounded method; paid replay overwrite; no create; org/same-student binding
- Reconciled stale references: `routes/invoices/` → `routes/kernel.ts`; generic
  `GET list + POST` → full snapshot/payload/whitelist/adapter path; single Tuition
  consumer → 3 shared-store consumers; reducer line 146-154 → 163-171;
  helper happy-path → real-handler isolation/guard matrix
- Cross-phase checks: phase-05 remaining/session derives stay source of truth;
  phase-09 can remove reducer runtime after phase-06 mark-paid leaves local-only
  path; phase-01 router guard contract stays unchanged; no student-tab code change
- Unresolved contradictions: 0

### Verification Results — 2026-08-19 (wave 7 pre-implementation)
- **Tier:** Light (phase-08 scoped; parent Full tier 2026-08-18 còn hiệu lực)
- **Claims checked:** 14 | **Verified:** 14 | **Failed:** 0 | **Unverified:** 0
- Key verifications: `KernelSnapshot`/`KernelSlice`/reducer payload thiếu 3 collection; provider chỉ fetch `/api/kernel`; read sites đã dùng `data.reports/notifs/commentBank`; grade modal await command bus; report UI expects `sid` + display strings; create-report Save Draft/Send share no-op modal across 2 callers; current bootstrap creates only `teacher` and has no role-management/import surface.
- Questions asked: 0 (issue + parent user locks resolve scope; red-team ambiguities locked as ordered two-step, duplicate append with server id, static send-log/chrome unchanged). Kongming GO_WITH_CONCERN resolved: comment POST `{id}` is commit ACK even when its following snapshot refresh fails; only actual POST failure is retryable.

### Whole-Plan Consistency Sweep — 2026-08-19 (wave 7)
- Files reread: `plan.md`, phase-01…phase-09 (phase-08 after edit).
- Decision deltas checked: 8.
- Reconciled stale references: 4.
- Unresolved contradictions: 0.

<!-- slug: persist-class-centric-domain-kernel -->
