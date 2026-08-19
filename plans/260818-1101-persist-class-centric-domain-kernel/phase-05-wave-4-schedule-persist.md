---
phase: 5
title: "Wave 4 Schedule persist"
status: pending
priority: P1
effort: "2d"
dependencies: [4]
---

# Phase 5: Wave 4 Schedule persist

## Overview

Bảng mới `lesson` với `classId` NOT NULL. Check-in/cancel persist qua command bus. `remaining`/`sessionsDone` derive. Dashboard "hôm nay" đọc D1.

## Context Links

- `apps/web/src/components/schedule/lesson-modal.tsx` (đọc `lesson.sid`:16, dispatch check-in/cancel:66,75)
- Dashboard check-in: `apps/web/src/routes/_auth/dashboard.tsx:51` (`l.sid`), `:73-75` (dispatch)
- Reader `l.sid` còn lại: `apps/web/src/routes/_auth/schedule.tsx:85`, `classes/$classId.tsx:59-60,180`, `students/$studentId.tsx:74`
- Reducer check-in case: `apps/web/src/lib/data-store-reducer.ts:142-157`
- Test lock: `apps/web/src/lib/data-store-reducer.test.ts:30-57` — "check-in l3 (upcoming) increments s1 package math and leaves classes unchanged" (pin chính là counter `pkg.done + 1` ở dòng 41-45, 54-56)
- Write bus: `apps/web/src/lib/repos/kernel.ts:16-28` (`KernelSlice`, `KERNEL_WRITE_TYPES`), `:45-113` (`kernelCommand`)
- Snapshot: `packages/api/src/contracts.ts:144-150` (`KernelSnapshot`), `apps/server/src/routes/kernel.ts:120-263` (`loadSnapshot`), `apps/web/src/lib/data-store-reducer.ts:21-23` (`kernel-loaded` payload)
- Invariant 2, 5, 6, 7

## Requirements

- Functional: lesson thuộc class. Check-in/cancel persist qua POST command bus (không còn local-only). `remaining = package.total - count(completed lessons của enrollment hiển thị)`.
- Non-functional: không tạo buổi mới (stub). Không đụng tuition/assignments routes. `schedule.tsx` không đổi code (đọc qua store; banner copy khóa đến wave 8).

## Architecture

```
lesson: id, orgId NOT NULL, classId NOT NULL → class.id (cascade),
        enrollmentId NOT NULL → enrollment.id (cascade),
        day, time, dur, type, status, topic, zoom
        index: lesson_org_idx (orgId), lesson_enrollment_idx (enrollmentId, status)
```

Đủ tầng đọc + ghi, thiếu một tầng là feature chết im (pass quality gate nhưng sai):

1. **Read path:** `KernelSnapshot` (contracts.ts) thêm `lessons: KernelLessonRow[]` (có `enrollmentId`); `loadSnapshot` SELECT lesson rows org-scoped; `KernelSlice` + `mapKernelSnapshot` (repos/kernel.ts) thêm `lessons`; payload `kernel-loaded` (data-store-reducer.ts:21-23) mở Pick thêm `"lessons"`. Không fetch riêng cho schedule — provider gate wave 0 giữ nguyên.
2. **Write path:** thêm `"check-in"`, `"cancel-lesson"` vào `KERNEL_WRITE_TYPES`; map trong `kernelCommand` → `POST /api/lessons/${lessonId}/check-in` và `/cancel`, body `{}`. Không qua `routes/lessons/` riêng — endpoint sống **trong** `kernelRoutes` (apps/server/src/routes/kernel.ts) để kế thừa bootstrap middleware + Origin/CSRF guard + content-type guard đã mount `kernel.use("*")` (kernel.ts:38-49). Không đụng `app.ts`.
3. **Adapter:** điền `Lesson.sid` từ enrollment.studentId cho **5 file / 6 site** còn đọc `l.sid`: `dashboard.tsx:51`, `lesson-modal.tsx:16`, `schedule.tsx:85`, `classes/$classId.tsx:59-60,180`, `students/$studentId.tsx:74`. Check-in 1:2 chỉ trừ remaining enrollment đó. Không cột `done` trên package.
4. **Remaining derive** tại `repos/students.ts` `mapStudents` (hiện hardcode `done: 0, remaining: pkg.total` ở :52-53): `pkg.done` = đếm lesson `status='completed'` có `enrollmentId === enrollment của package đang hiển thị`; `remaining = total - done`. Giữ quy tắc chọn package mới nhất active/student (display rule khóa; student nhiều enrollment chỉ hiển thị package mới nhất — entitlement khác vẫn derive đúng khi được chọn hiển thị).
5. **sessionsDone derive** tại `repos/classes.ts` `mapClasses` (hiện pass-through cột lưu, comment "until Wave 4" ở :15-16): bỏ pass-through, đếm **distinct `(day,time)`** trong số lessons của class có ≥1 row completed (1:2 session = 1 buổi, không double-count 2 enrollment). Cột `sessions_done` giữ trong schema nhưng bỏ đọc (không drop migration).
6. **Transition matrix:** check-in `upcoming → completed`; cancel `upcoming → cancelled`; khác → 409. Status không bao giờ đọc từ request body. Enum domain pin trong contract: `completed|upcoming|cancelled|absent` (mock-data.ts:31) — **không** dùng/dùng lại `lessonUpsertSchema` của syllabus (invariant 5, name collision contracts.ts:59-65).

Dashboard "hôm nay" đọc lesson từ store đã hydrate D1. **Giữ** filter `day === 2` (design-week). Không đổi sang `Date()`.

Xóa/biểu test counter **chỉ khi** thay bằng test derive (xem Implementation Steps 6). Không nới invariant.

Tạo buổi lịch vẫn không có write path — non-goal. Test persist dùng helper insert, **không** mở stub/UI tạo buổi. Runtime từ wave 0: `lessons = []` cho đến khi test/helper insert.

## Related Code Files

- Create: `packages/db/src/schema/lesson.ts` + migrate (drizzle-kit generate, `packages/db/src/migrations`)
- Modify: `apps/server/src/routes/kernel.ts` (loadSnapshot + 2 endpoint + binding validation), `apps/server/src/kernel.test.ts`
- Modify: `packages/api/src/contracts.ts` (KernelLessonRow + KernelSnapshot.lessons + enum; không đụng `lessonUpsertSchema`)
- Modify: `apps/web/src/lib/repos/kernel.ts` (KernelSlice + KERNEL_WRITE_TYPES + kernelCommand + mapKernelSnapshot), `apps/web/src/lib/data-store-reducer.ts` (payload `kernel-loaded`)
- Create: `apps/web/src/lib/repos/lessons.ts` (mapping Lesson từ snapshot row — mirror `repos/students.ts`)
- Modify: `apps/web/src/lib/repos/students.ts` (remaining derive), `apps/web/src/lib/repos/classes.ts` (sessionsDone derive)
- Modify: `apps/web/src/components/schedule/lesson-modal.tsx`, dashboard check-in block (chỉ nếu cần retype — dispatch giữ nguyên)
- Zero-change: `apps/web/src/routes/_auth/schedule.tsx` (đọc qua store)
- Do not modify: `tuition.tsx`, `assignments/*`, `apps/server/src/app.ts`

## Implementation Steps

1. Schema `lesson` (classId + enrollmentId NOT NULL, FK cascade, 2 index) + migrate.
2. POST `/api/lessons/:id/check-in`, `/cancel` trong `kernelRoutes`. Không UPDATE package. Transition matrix 409. Handler validate: lesson cùng org; `enrollment.classId === lesson.classId` (chống lệch cặp).
3. Read path: contracts + loadSnapshot + KernelSlice + `kernel-loaded` payload + `repos/lessons.ts` mapping (điền `sid` từ enrollment).
4. Write path: `KERNEL_WRITE_TYPES` + `kernelCommand` (body `{}`).
5. Derive: `mapStudents` remaining theo enrollment của package hiển thị; `mapClasses` sessionsDone distinct (day,time).
6. Test: server `kernel.test.ts` — (a) derive trên snapshot sau check-in (remaining giảm đúng enrollment, sessionsDone đúng unit); (b) transition matrix (completed/cancelled → 409); (c) "cross-org lesson writes (Wave 4 isolation lock)" mirror block 450-545 (org B check-in/cancel lesson org A → 404; snapshot org B 0 lesson); (d) Origin guard test mở rộng cho 2 endpoint (403 foreign Origin, 415 non-JSON). Web: thay counter assertions trong `data-store-reducer.test.ts:30-57` (gồm `pkg.done + 1` 41-45, 54-56) bằng derive contract test; test idempotent/unknown-id giữ ngữ nghĩa qua server transition tests.

## Todo

- [x] Bảng lesson + classId/enrollmentId NOT NULL + FK + index
- [x] Read path: snapshot/contract/slice/payload/repos-lessons
- [x] Write path: KERNEL_WRITE_TYPES + kernelCommand + 2 endpoint (trong kernelRoutes)
- [x] Remaining derive ở mapStudents; sessionsDone derive ở mapClasses; 0 UPDATE session_package.done
- [x] Dashboard hôm nay từ D1 (giữ `day === 2`)
- [x] Test derive thay counter + isolation + guard + transition

## Success Criteria

- [x] Reload giữ trạng thái buổi
- [x] `lesson.classId` NOT NULL (và `enrollmentId` NOT NULL)
- [x] Check-in không ghi counter package
- [x] Org mới: 0 lesson (không seed l1–l11)
- [x] Quality gate xanh (`pnpm test && pnpm check-types && pnpm run check`)

## Evidence (2026-08-19)

- Quality gate fresh-run: 120/120 tests (server 30 + web 90), check-types 5/5 tasks, biome — 0 diagnostic trên file wave 4 (5 warning pre-existing ở file không đụng).
- Tester agent độc lập: 9/9 acceptance criteria có test riêng — persist (kernel.test.ts check-in/cancel → snapshot), NOT NULL + FK + index (migration 0002), no-counter-write (packages/classes toEqual before/after), new-org-0-lessons, cross-org 404 + snapshot rỗng, guards 403/415/400, transitions 3× 409 + binding 409, derives (1:2 isolation, distinct day/time, sid resolve), write wiring (isKernelWrite + path + body {}).
- Code-review agent: 0 Critical; 1 Important (transition check-then-act race) — FIXED bằng conditional UPDATE `WHERE status='upcoming'` + `.returning()` zero-rows → 409 (routes/kernel.ts). Minor: fixture reducer guard tighten `lesson?.status !== "upcoming"` (mirror server matrix); `KernelClassRow.sessionsDone` doc-comment "legacy, derive thay"; enum pin contracts giữ convention `| string` như sibling rows.
- Đăng ký reviewer: `apps/web/src/lib/repos/lessons.ts` mapping drop orphan row (FK cascade → không xảy ra runtime, defense-in-depth).

## Risk Assessment

Mock `Lesson.sid` (student) vs kernel `classId`. Adapter phải resolve student từ enrollment. Signal: 1:2 class check-in trừ sai HV. Response: check-in gắn lesson↔enrollment, không chỉ `sid`; handler chặn lệch cặp classId↔enrollment.

Read/write path đa tầng (contract, server, slice, payload, whitelist) — thiếu một tầng = fail im. Signal: check-in "hoạt động" trong session nhưng mất sau reload, hoặc lịch trống dù D1 có row. Response: test (a)/(c) ở step 6 bắt cả hai.

Không có UI tạo buổi → lịch org mới trống mãi đến plan khác. Đúng non-goal.

## Security Considerations

Check-in/cancel chỉ lesson cùng org + user là teacher của org (membership bootstrap middleware). Endpoint sống trong `kernelRoutes` để kế thừa Origin/CSRF + content-type guard (kernel.ts:38-49) — cấm mount router riêng bỏ guard. Status không đọc từ body; transition matrix chặn `cancelled→completed` / `completed→cancelled` (409). Cookie SameSite=None + `credentials: 'include'` → guard test bắt buộc cho 2 endpoint mới.

## Red Team Dispositions

### Session — 2026-08-19 (Wave 4 scope re-verification, scoped phase-05)
**Reviewers:** Security Adversary + Assumption Destroyer (tier Light — Fact Checker). 2 reviewers, 17 findings thô → 12 unique sau dedup, 12 accepted, 0 rejected. Tất cả có evidence `file:line`.

| # | Finding | Severity | Disposition | Áp dụng |
|---|---------|----------|-------------|---------|
| 1 | Read path không có lessons ở 4 tầng (KernelSnapshot/loadSnapshot/KernelSlice/kernel-loaded payload) — `data.lessons` stay `[]` | Critical | Accept | Architecture 1, Steps 3, Related Files |
| 2 | `check-in`/`cancel-lesson` không có trong `KERNEL_WRITE_TYPES` → local-only, không bao giờ POST | Critical | Accept | Architecture 2, Steps 4 |
| 3 | Origin/CSRF guard là per-router (kernel.use) — router `routes/lessons/` riêng sẽ mất guard | High | Accept | Endpoint sống trong kernelRoutes; guard test (d) |
| 4 | "Không cho client gửi done" vacuous (không có cột done); thiếu transition matrix; `cancelled→completed` lọt | High | Accept | Architecture 6 (upcoming-only, 409) |
| 5 | Remaining derive không có chỗ định danh; mapStudents hardcode done:0; multi-enrollment ill-defined | High | Accept | Architecture 4 (derive tại mapStudents, theo enrollmentId của package hiển thị) |
| 6 | sessionsDone pass-through cột lưu tại mapClasses (comment "until Wave 4"); unit 1:2 undefined | High | Accept | Architecture 5 (distinct day,time) |
| 7 | Enum "4 consumer" sai — 5 file/6 site (sót schedule.tsx:85, classDetail:180); line refs lệch | Medium | Accept | Architecture 3, Context Links |
| 8 | Test lock trích dẫn sai (test 30-57 pin `pkg.done+1`; reducer case 142-157 không phải 122-136); 5 test liên quan | Medium | Accept | Context Links, Steps 6 |
| 9 | Binding lesson↔enrollment không ràng buộc (enrollment class B trên lesson class A) | Medium | Accept | Steps 2 (validate enrollment.classId == lesson.classId) |
| 10 | Schema thiếu FK/index convention (FK cascade + org/enrollment index) | Medium | Accept | Architecture schema block |
| 11 | Name collision `lessonUpsertSchema` (syllabus, invariant 5); body POST undefined | Medium | Accept | Architecture 6 (body `{}`, không dùng lại tên) |
| 12 | Isolation test không nêu harness — wave-0 note đòi server handler test | Medium | Accept | Steps 6(c) mirror kernel.test.ts:450-545 |

Ghi chú verified-clean: migration convention tồn tại (`packages/db` drizzle-kit `db:generate` out `./src/migrations`; alchemy `migrationsDir`); `apps/server` test harness có sẵn (`vitest run` + kernel.test.ts chạy handler thật trên libsql in-memory + helper insert).
