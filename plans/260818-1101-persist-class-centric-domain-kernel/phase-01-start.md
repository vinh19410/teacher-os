---
phase: 1
title: "Wave 0 Kernel"
status: completed
priority: P1
effort: "3-4d"
dependencies: []
---

# Phase 1: Wave 0 Kernel

## Overview

Tạo schema + API kernel + bootstrap org trống + tách repos/adapter. 12 route `_auth` dùng store không đổi (settings không import store). UI vẫn đọc `useData()` shape `MockData`. Kernel **write modal** (không phải stub) được sửa để chờ id server.

## Context Links

- Advise §2.2: `plans/reports/advise-2026-08-17-feature-rollup-roadmap.md`
- Scout: `plans/reports/scout-2026-08-18-persist-class-centric-kernel.md`
- Backend: `plans/reports/researcher-2026-08-18-backend-d1-auth.md`
- Provider: `apps/web/src/lib/data-store.tsx:37-56`
- Server: `apps/server/src/index.ts:10-24`
- Schema: `packages/db/src/schema/index.ts:1`
- Auth: `packages/auth/src/index.ts` — chưa `getSession` trên server

## Requirements

- Functional: CRUD kernel (student, class, syllabus tree, enroll, assign, class notes, session_package trên enrollment). Login đầu → org trống + membership `teacher`.
- Non-functional: mọi query `orgId` từ membership. POST-only write. CORS không nới PATCH/DELETE. Không seed demo.

## Architecture

1. **Schema mới** (file riêng, barrel 1-line export):
   - `organization`, `membership(orgId, userId, role)`
   - `student` (person, không pkg)
   - `class` (không `student_ids` JSON)
   - `syllabus`, `syllabus_module`, `syllabus_lesson`
   - `enrollment` unique `(classId, studentId)`
   - `session_package` FK `enrollmentId`
   - Không tạo `lesson` / `invoice` / `assignment` / `report`

2. **Bootstrap middleware** trên mọi `/api/*` trừ `/api/auth/*`, sau `createAuth().api.getSession({ headers })`. 0 membership → INSERT org (name từ `user.name`) + membership `role=teacher`. Idempotent. Unique `(orgId, userId)`. Re-read nếu race. Không `unique(userId)` toàn cục. Không `owner`. Không hook `user.create`. Không `GET /api/me`. Fetch `credentials: 'include'`.

3. **API** Hono + Zod trong `packages/api`. Org = membership của session. Không header tenant.

   ```
   GET  /api/kernel                 # snapshot kernel → adapter; bootstrap chạy ở middleware
   GET  /api/students
   POST /api/students               # body classId? → server tạo enrollment + package
   GET  /api/classes
   POST /api/classes
   POST /api/classes/:id/assign-syllabus
   POST /api/classes/:id/notes
   GET  /api/syllabi
   POST /api/syllabi
   POST /api/syllabi/:id/modules
   POST /api/syllabi/:id/modules/:mid
   POST /api/syllabi/:id/modules/:mid/lessons
   POST /api/syllabi/:id/modules/:mid/lessons/:lid
   ```
   Không public `POST .../enrollments` (enroll HV cũ = stub). Không `X-Org-Id`. Org = membership duy nhất của session.

4. **Adapter**
   ```
   apps/web/src/lib/data-provider.tsx   # context only (tách từ data-store.tsx)
   apps/web/src/lib/repos/kernel.ts     # fetch/map kernel → MockData
   apps/web/src/lib/repos/lessons.ts    # in-memory đến wave 4
   apps/web/src/lib/repos/invoices.ts
   apps/web/src/lib/repos/assignments.ts
   apps/web/src/lib/repos/reports.ts
   apps/web/src/lib/repos/notifs.ts
   ```
   Map: `Student.pkg` ← package enrollment `status=active` mới nhất; không có → remaining=0. `Class.studentIds` ← enrollments.
   **Runtime:** `seedData` không mount. Collection chưa peel = `[]`. Reducer chỉ write in-session collection chưa peel.
   **Loading gate:** `DataProvider` không render children (không expose store) đến khi GET `/api/kernel` settle hoặc error. Empty snapshot sau load ≠ loading. Tránh 4 detail `throw notFound()` (`students/$studentId.tsx:69`, `classes/$classId.tsx:51`, `syllabus/$syllabusId.tsx:78`, `assignments/$assignmentId.tsx:39`).
   **Command bus:** `dispatch` kernel action → POST → thay id local bằng id server → refetch. API fail → không optimistic row, surface error. Wave 0 **được** sửa kernel write modal (không stub): `add-student-modal`, `add-class-modal`, `add-syllabus-modal` (id trước `onCreated`), `assign-syllabus-modal`, module/lesson giáo trình, `update-class-notes`. Check-in **không** ghi `session_package.done`.
   Characterization: 23 test trong `data-store-reducer.test.ts` import `seedData`. Contract enroll 3 test parse JSX, không import seed.

5. **add-student không classId**: persist person. Package form không lưu (không có enrollment). Reload: `pkg.remaining=0`. add-student + `classId`: person + enrollment + session_package.

## Related Code Files

- Create: `packages/db/src/schema/organization.ts`, `membership.ts`, `student.ts`, `class.ts`, `syllabus.ts`, `enrollment.ts`, `session-package.ts`
- Create: `packages/api` (package.json + Zod contracts)
- Create: `apps/server/src/routes/kernel/` + session helper
- Create: `apps/web/src/lib/data-provider.tsx`, `apps/web/src/lib/repos/*.ts`
- Modify: `packages/db/src/schema/index.ts` (1-line exports)
- Modify: `apps/server/src/index.ts` (mount kernel + middleware bootstrap; CORS không thêm header)
- Modify: `apps/web/src/components/layout/app-shell.tsx` (mount provider)
- Modify: `apps/web/src/lib/data-store.tsx` (shim `useData` — 26 file: 12 route + 11 modal + lesson-modal + topbar + app-shell)
- Modify: kernel write modals (không stub) để chờ id server
- Create: `apps/server` test script + isolation test (2 org)
- Do not modify: 12 route store, stub `add-invoice-modal` / `create-report-modal`, `settings.tsx`, `topbar.tsx` copy, `.github/workflows/ci.yml`

## Implementation Steps

1. Schema + `pnpm run db:generate`. Chạy `alchemy dev` + query `sqlite_master`. Nếu không apply: dùng path Alchemy/Wrangler đã bind — không `drizzle-kit migrate` thiếu creds.
2. `packages/api` Zod tay + script `check-types`. Cấm đổi `bts.jsonc` `api`. Không sửa `ci.yml`.
3. Session helper `getSession` trên Hono. Bootstrap idempotent.
4. Kernel routes POST/GET. Authorize membership. Filter `orgId`.
5. Tách provider + repos. Kernel writes qua API. Lesson/invoice/assignment/report/notif giữ reducer.
6. Adapter map pkg + studentIds. Check-in vẫn mock math trên bản map in-session.
7. Test: bootstrap teacher; org trống; isolation 2 org; add student/class/syllabus/enroll/assign → reload còn; `pnpm test` characterization vẫn xanh (fixture seed).

## Todo

- [x] 9 bảng kernel + migrate
- [x] `packages/api` Zod + mount Hono
- [x] Bootstrap org trống + membership teacher
- [x] Tách DataProvider / repos
- [x] Adapter pkg + studentIds
- [x] Isolation test
- [x] Gate: reload còn; test + check-types + check xanh

## Success Criteria

- [x] Login user mới: 0 student/class/syllabus; 1 membership `teacher`
- [x] Tạo HV+lớp+enroll+syllabus+assign → hard refresh còn
- [x] 0 cột `student.pkg_*`, 0 JSON `student_ids`
- [x] Check-in không UPDATE `session_package`
- [x] 13 màn hành vi giữ (trừ persist kernel writes + HV không lớp mất pkg sau reload)
- [x] `pnpm test && pnpm check-types && pnpm run check` exit 0

## Risk Assessment

- Alchemy `dev` có thể không apply migrate như `deploy` (README chỉ claim deploy). Signal: table missing lúc `pnpm run dev`. Response: document apply path; fail closed, không fake in-memory schema.
- HV không lớp mất pkg sau reload. Signal: user coi là bug. Response: không tự tạo lớp 1:1 (non-goal); ghi rõ trên issue wave 0.
- Shared barrels (`schema/index.ts`, `server/src/index.ts`) conflict nếu wave sau mở song song. Response: 1-line mount only.

## Security Considerations

Mọi kernel query `WHERE orgId = sessionOrg`. Nested `:mid`/`:lid` phải thuộc parent + org (không tin id client). `classId` trên POST student phải là class cùng org. POST kernel kiểm tra `Origin` === `CORS_ORIGIN` (cookie `SameSite=None` + CORS hiện fail-open — `apps/server/src/index.ts:10-18`, `packages/auth/src/index.ts:36-39`). 0 membership sau bootstrap fail → 403. Không header tenant. `class.syllabusId` nullable (form có thể để trống). Client fetch dùng `VITE_SERVER_URL` (không gọi relative `/api` trên :8001). Helper insert chỉ trong test.
