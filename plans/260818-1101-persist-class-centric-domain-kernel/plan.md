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
| 1 | [Wave 0 Kernel](./phase-01-start.md) | 0 | Pending |
| 2 | [Wave 1 Students peel](./phase-02-wave-1-students-peel.md) | 1 | Pending |
| 3 | [Wave 2 Syllabus peel](./phase-03-wave-2-syllabus-peel.md) | 2 | Pending |
| 4 | [Wave 3 Classes peel](./phase-04-wave-3-classes-peel.md) | 3 | Pending |
| 5 | [Wave 4 Schedule persist](./phase-05-wave-4-schedule-persist.md) | 4 | Pending |
| 6 | [Wave 5 Tuition persist](./phase-06-wave-5-tuition-persist.md) | 5 | Pending |
| 7 | [Wave 6 Assignments persist](./phase-07-wave-6-assignments-persist.md) | 6 | Pending |
| 8 | [Wave 7 Reports + notifs + comment bank](./phase-08-wave-7-reports-notifs-comment-bank.md) | 7 | Pending |
| 9 | [Wave 8 Remove mock runtime](./phase-09-wave-8-remove-mock-runtime.md) | 8 | Pending |

DAG GitHub: `0 → {1,2,3}` độc lập; `3 → 4 → 5`; `3 → 6 → 7` (serial trên `grade-modal.tsx`); `3 → 7` cũng cần wave 6 xong; `8` sau `4+5+6+7`. 1+2+3 **không** block lẫn nhau. 1+2+3 có thể 1 PR / 3 commit. Serial nếu 1 agent. Không song song 2 wave trên `schema/index.ts`, `server/src/index.ts`, `data-store-reducer.ts`, `grade-modal.tsx`.

## Execution notes

- Mutation = POST action. CORS giữ `GET|POST|OPTIONS` + `Content-Type`/`Authorization` (`apps/server/src/index.ts:12-16`). Không PATCH. Không `X-Org-Id`.
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

## Validation Log

### Verification Results
- **Tier:** Full (9 phases)
- **Claims checked:** 22
- **Verified:** 20 | **Failed:** 0 | **Unverified:** 2 (`alchemy dev` apply migrate — chưa chạy live; CORS fail-open behavior — đọc source `index.ts:10-18` đủ để thêm Origin check)
- Open questions asked: 0 (advise + red-team đã lock; không còn decision user)

### Whole-Plan Consistency Sweep
- Unresolved contradictions: 0

<!-- slug: persist-class-centric-domain-kernel -->
