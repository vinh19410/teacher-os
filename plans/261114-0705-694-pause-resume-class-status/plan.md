---
store_id: "teacher-os/261114-0705-2"
title: "feat(classes): Cho phép tạm dừng và mở lại lớp học (#694)"
description: "Triển khai chuyển trạng thái lớp hai chiều active ↔ paused (0 DB migration), khóa nguyên tử D1 TOCTOU, lọc lịch/nhắc việc/điểm danh không phá hủy dữ liệu, và cập nhật đồng bộ Teacher Web + Student Portal."
status: completed
priority: P1
issue: 694
branch: "vinh19410/feat-classes-allow-pausing-and-resuming-class-st"
base_branch: "develop"
tags: ["classes", "kernel", "web", "student", "d1-concurrency"]
---

# Plan: Tạm dừng và mở lại trạng thái lớp học (#694)

> **Tư liệu nguồn đã xác nhận với người dùng (A1 / A2 / A3) + Thẩm định Kongming + Red-Team:**
> - **A1:** Đúng 2 trạng thái đảo ngược được trên `classTable.status` (`packages/db/src/schema/class.ts:27`): `"active"` (`Đang học`) ↔ `"paused"` (`Tạm dừng`). Không thêm `"archived"`; không cần DB migration. Giữ `PATCH /api/classes/:id` (`classUpdateSchema.strict()`) từ chối `status`; mở endpoint riêng `POST /api/classes/:id/status` có guard role org-member (từ chối `ta` với `403`).
> - **A2:** Tạm dừng là thao tác **phi phá hủy** — giữ nguyên toàn bộ `lesson` & `class_session` trong DB. Ẩn buổi sắp tới/projected/legacy của lớp `paused` khỏi `/schedule`, `/dashboard`, `/api/dashboard/reminders`, `findScheduleConflicts`, và `GET /api/student/schedule`; giữ lại lịch sử `dated` (`completed | absent`) ở dạng chỉ-xem (`classPaused: true`, loại khỏi `counts.pending` trên `/attendance`, giữ nguyên sĩ số bucket trên `/attendance` và `/schedule`). Chặn thao tác ghi giảng dạy bằng `409 CLASS_PAUSED` trong khi vẫn cho phép Sửa/Hủy/Xóa buổi, Sửa lớp, Ghi chú, Học phí, Sửa/Sync giáo trình (bỏ qua `backfillStuckEnrollments` khi đang tạm dừng), cũng như các tính năng học thuật/tài chính hiện hành của học viên đã active (assignments, study-pack, vocab, materials, invoices).
> - **A3:** Chặn tuyển sinh/kích hoạt mới (`POST /classes/:id/enroll`, `POST /students` kèm `classId`, `POST .../enrollments/:id/accept`, `POST /students/:id/resend-invite` trỏ lớp tạm dừng) bằng `409 CLASS_PAUSED`, giữ `activateEnrollment` idempotent `200` cho enrollment đã `active` và giữ `DELETE /enrollments/:id`. Bổ sung chip filter `"Tạm dừng"` trên `/classes` (URL search param optional `?filter=`), `ClassStatusModal` trên `/classes/$classId`, lọc lớp tạm dừng khỏi `AddStudentModal`, và xử lý đồng bộ trên Student Portal.

## Phases

| Phase | Title | Status | File |
|---|---|---|---|
| 1 | Contracts and Server | done | [phase-01-start.md](./phase-01-start.md) |
| 2 | Web and Student UI | done | [phase-02-web-and-student-ui.md](./phase-02-web-and-student-ui.md) |
| 3 | E2E Review and Docs | done | [phase-03-e2e-review-and-docs.md](./phase-03-e2e-review-and-docs.md) |

## Architectural Locks & Invariants

1. **D1 Atomic Concurrency (Zero interactive transactions):**
   - `POST /students` (kèm `classId`) và `POST /classes/:id/enroll` luôn chèn `enrollment.status` ở Batch 1 bằng `CASE WHEN EXISTS (SELECT 1 FROM class WHERE ... AND status = 'active') THEN 'invited' ELSE NULL END` (với `catch` phân giải `FOREIGN KEY` → `404`, `UNIQUE` → trùng, `NOT NULL` → `409 CLASS_PAUSED`).
   - Khi `activateNow === true`, luôn đi qua `activateEnrollment`: `materializeScheduleForEnrollment` (`enrollment-activation.ts:294,500`) kiểm tra `${classTable.status} = 'active'` trong Statement 0 và thoát ngay với `"class-paused"` (không retry rồi `500`); nếu Statement 0 thua race sau CAS, `activateEnrollment` rollback `enrollment` về `'invited'` (khi chưa có `lesson`) trước khi trả `"class-paused"`, và `POST /students` / `POST /classes/:id/enroll` chạy compensating cleanup (`enrollment` + `student` mới tạo, chưa mark `studentInvitation` `'accepted'`) trước khi trả `409 CLASS_PAUSED`.
   - `POST /classes/:id/sessions` dùng guard `CASE WHEN EXISTS (... status = 'active') THEN ${dateISO} ELSE NULL END` và `catch` phân giải `404` (`!clsAfter`), `UNIQUE` (`date-occupied`), `NOT NULL` (`409 CLASS_PAUSED`).
   - `holidays.ts` (`L318`, `L420`) nhúng `EXISTS (... class.status = 'active')` trong batch D1 và trả `409 CLASS_PAUSED` cho `scope: "classes"` khi trỏ lớp `paused` (**không** chặn `DELETE /holidays/:id` undo `L849` để hoàn tác được kỳ nghỉ org-wide).
   - Quyền `POST /api/classes/:id/status`: `canManageClassStatus` (`packages/auth/src/role.ts`, fail-closed) kèm wrapper `role === undefined ? true : canManageClassStatus(role)` ở `kernel.ts` và fallback `data.viewer?.role ?? "teacher"` ở `$classId.tsx`.
2. **D1 0-Row Update Guards:** Trên `PUT /classes/:id/sessions/:date/attendance`, `occurrenceStatusAction("completed")`, `lessonStatusAction("completed")` (`findLessonAction` chọn thêm `classStatus`), và `activateEnrollment`, nhúng `EXISTS (... class.status = 'active')` vào `WHERE`; khi 0 dòng/mismatch, re-read DB và kiểm tra theo đúng thứ tự (`alreadyActive` → `200`, entity missing → `404`, `!clsAfter` → `404`, `clsAfter.status !== "active"` → `409 CLASS_PAUSED`) trước mọi fallback (`200 { updated: 0 }`, `roster-changed`, `409 Conflict`).
3. **Bucket-Level Integrity & Legacy Separation:** Trong `daily-attendance.ts` (`queryDailyRows` ở cả 2 nhánh `select`), `schedule-week/day/month.ts`, không lọc per-row trong `excludeNonTeachingSessions`. Bỏ toàn bộ `legacy` (`date === null`) bucket của lớp `paused`; chỉ giữ `dated` bucket có `>= 1` dòng `completed | absent` với **full danh sách dòng của bucket**; chỉ gắn `classPaused: true` cho lớp `paused`; loại `classPaused` khỏi `counts.pending` + 5 nhánh `!s.recorded` của `attendance.tsx` + khóa read-only `AttendanceSessionRow`; sửa `rollupSessionStatus` để lịch sử `absent` không rơi về `"upcoming"`.
4. **Resilience & Schema Normalization:** `KernelClassRow` (TS interface) thu hẹp `status: ClassStatus` kèm chuẩn hóa tại `apps/server/src/routes/snapshot.ts:669` và `student-class.ts:132`; `studentClassSchema.status` dùng `z.enum(CLASS_STATUSES).catch("active")` giống `enrollmentStatus`.
5. **Student Portal Consistency:** Ép `nextSession = null` trên `/overview`, `/classes/:classId`, `/schedule` khi `row.status !== "active"`; trên Student UI ép `nextId = null` ở `ClassInfoCard` + `ClassLessonList`, hiển thị `"Tạm hoãn"` cho buổi `upcoming` quá giờ của lớp `paused`, sửa KPI `"Lớp đang học"` ở `_auth/index.tsx:152`, invalidate cache đầy đủ trên `useAcceptClassEnrollment` & `onError`, và map `HttpError` (`isHttpError`) sang tiếng Việt thay vì lộ status text thô.
6. **Web Error Surface (`409 CLASS_PAUSED`):** Truyền `code?: string` xuyên qua `KernelCommandResult`, `OccurrenceActionResult`, `runOccurrenceWrite` (gọi `await refresh()`), `DailyAttendanceApiError`; bỏ `toast.info` thứ 2 trong `reportDirectOutcome` khi `toastKind === "error"`; `useKernelFormSubmit` gọi `void refresh()` khi dính `409 CLASS_PAUSED`.
7. **Design Tokens & Filter URLs (`DESIGN.md`):** Nút `"Tạm dừng lớp"` dùng `variant="outline"` (tuyệt đối không `destructive`); badge trạng thái dùng `<Badge variant="muted">Tạm dừng</Badge>`; `/classes` dùng `validateSearch` trả về `{ filter?: ClassListFilter }` optional hoàn toàn để giữ typed `<Link to="/classes">` hợp lệ.

## Validation Log

- **Tier:** Standard (`ak plan validate` exit 0 + 3 red-team personas + Kongming post-plan-gates checkpoint).
- **Automated Checks:** `ak plan reindex --apply && ak plan validate plans/261114-0705-694-pause-resume-class-status` -> `[OK] plans/261114-0705-694-pause-resume-class-status is a valid plan directory` (3 phases, 11 tasks).
- **Kongming Post-Plan-Gates (`e02e9f68`):** Verdict `GO` — đã chốt 5 tinh chỉnh cuối trước Phase 1 TDD: bỏ `class.status = 'active'` khỏi `DELETE /holidays/:id` undo (`L849`), thêm `409 CLASS_PAUSED` cho `POST /holidays` (`scope: "classes"` + UI `repos/holidays.ts` / `holiday-modal.tsx`), khóa fail-closed `canManageClassStatus` (`packages/auth/src/role.ts` + wrapper ở `kernel.ts` + `data.viewer?.role ?? "teacher"` ở `$classId.tsx`), sửa thứ tự `catch` ở `materializeScheduleForEnrollment` + double-click CAS `0-row` ở `activateEnrollment` + export `backfillStuckEnrollments`, và bảo vệ lịch sử ở empty state `/schedule` + `isHttpError` trên Student Portal.
- **Requirement & Edge-Case Verification:** Đã kiểm chứng toàn bộ A1/A2/A3 (2 trạng thái đảo ngược, 0 DB migration, ẩn lịch sắp tới & nhắc việc nhưng giữ dữ liệu & lịch sử, chặn tuyển sinh/check-in/attendance `409 CLASS_PAUSED`, cập nhật Web & Student Portal). Đã đồng bộ các điểm sửa từ Red-Team & Whole-Plan Consistency Sweep vào `phase-01-start.md`, `phase-02-web-and-student-ui.md`, `phase-03-e2e-review-and-docs.md`.

## Red Team Review

Tổng hợp kiểm định chéo từ 3 persona (`Security Adversary`: 1C/6I/1M, `Failure Mode Analyst`: 4C/6I/2M, `Assumption Destroyer`: 4C/4I/2M — tổng hợp sau loại trùng còn 11 cụm phát hiện):

1. **[ACCEPTED — Critical] Non-atomic `activateNow: true` + thiếu `class.status = 'active'` trong `materializeScheduleForEnrollment` (`enrollment-activation.ts:294,500,639`):** Sửa Task 1.2 luôn insert `'invited'` ở Batch 1, kiểm `classTable.status = 'active'` ở Statement 0, thoát sớm `"class-paused"`, rollback CAS về `'invited'`, và compensating cleanup khi thua race.
2. **[ACCEPTED — Critical] Sót `POST /enrollments/:enrollmentId/accept` trong `kernel.ts:1458`, `occurrenceStatusAction` trả `200 { updated: 0 }`, `findLessonAction` thiếu `classStatus`, `0-row` race che `404`/`UNIQUE`:** Đã bổ sung map `class-paused` ở `kernel.ts:1468`, thêm `classStatus` vào `findLessonAction`, tách thứ tự `404 / UNIQUE / CLASS_PAUSED` trong các `catch` & `0-row` fallback của Task 1.2.
3. **[ACCEPTED — Critical] `syllabus.ts` `backfillStuckEnrollments` & `holidays.ts` D1 race guard (`L318,420`) + `scope: "classes"`:** Đã khóa `backfillStuckEnrollments` không chạy trên lớp `paused` (chỉ chạy bù khi resume `paused -> active`), nhúng `EXISTS (... status = 'active')` vào `holidays.ts` batch và trả `409 CLASS_PAUSED` khi `scope: "classes"` nhắm lớp `paused`. Đối với `assignments`/`study-packs`/`materials`/`vocab`/`invoices`, ghi rõ giữ mở theo A3 cho học viên & lớp hiện hữu.
4. **[ACCEPTED — Critical] `KernelClassRow.status` làm vỡ `snapshot.ts:669` & thiếu `.catch("active")` trên `studentClassSchema`:** Đã đưa `snapshot.ts:669`, `student-class.ts:132`, và `z.enum(CLASS_STATUSES).catch("active")` vào Task 1.1 & 1.3.
5. **[ACCEPTED — Important] Role authorization trên `POST /api/classes/:id/status`:** Đã thêm guard từ chối role `ta` (`403`) + test case trong Task 1.2.
6. **[ACCEPTED — Important] `POST /students/:id/resend-invite` (cooldown/join orgId/fallback `ALREADY_JOINED`):** Đã thêm `eq(classTable.orgId, ctx.orgId)`, chuyển check trạng thái lớp lên trước `cooldownMs` & `lastInviteEmailAt`, và xử lý học viên chỉ có invite lớp `paused` -> `409 CLASS_PAUSED`.
7. **[ACCEPTED — Important] Đồng bộ 5 nhánh `!s.recorded` trên `attendance.tsx`, `DailyAttendanceApiError` rơi `code`, bỏ `legacy` bucket lớp `paused`:** Đã cập nhật vào Task 1.3, 2.1, và 2.3.
8. **[ACCEPTED — Important] `/schedule` bucket-level filter, `rollupSessionStatus` cho `absent`, empty state `schedule.tsx:196`, `AddStudentModal` `L224`, `$classId.tsx` nút Thêm HV & `runOccurrenceWrite`, `reportDirectOutcome` double toast, `setConfirmAction(null)` timing, `SessionAttendanceModal` `fallbackDisplay`:** Đã cập nhật đầy đủ vào Task 2.1, 2.2, và 2.3.
9. **[ACCEPTED — Important] `/classes` `validateSearch` optional + sửa `classes/index.test.tsx`, Student Portal `ClassLessonList` `"Đã kết thúc"`, StatCard `_auth/index.tsx:152`, cache invalidation & safe Vietnamese error mapping:** Đã cập nhật vào Task 2.3 và 2.4.
10. **[ACCEPTED — Minor] Hiệu đính 7 symbol/line (`POST /lessons/:id/restore` không tồn tại, `queryDailyRows`, `kernelCommand`, `list-page-filters.test.ts`, `class-operations.spec.ts:74`, `vitest run` command, seed `@test.local` sạch PII cho ảnh POT):** Đã cập nhật chuẩn xác trên cả 3 file phase.
11. **[DEFERRED / CLARIFIED] Chặn thêm `POST /classes/:id/assignments`, `POST /classes/:classId/study-packs`, `quiz/start` và ẩn hoàn toàn `lessons` trên `GET /student/classes/:classId`:** Giữ nguyên A2/A3 đã chốt với người dùng (học viên active giữ quyền xem lịch sử/bài tập/từ vựng/học phí, và chi tiết lớp hiển thị buổi đã qua + nhãn trung tính `"Tạm hoãn"` không hiện `"Buổi tới"`). Cân nhắc bỏ phát `scheduleChangedEvents` khi hủy/sửa buổi của lớp `paused` để không gây nhiễu học viên.

## DONE Criteria

- [x] Toàn bộ contracts, role guard, server write guards (kể cả D1 race scenarios), và server read filters (`daily-attendance`, `dashboard-reminders`, `student`, `snapshot`, `syllabus`, `holidays`) được chứng minh bằng automated tests.
- [x] Web (`/classes` + `?filter=`, `/classes/$classId`, `/schedule`, `/dashboard`, `/attendance`, `/students/$studentId`, `AddStudentModal`) và Student Portal đồng bộ 2 trạng thái `active ↔ paused`, không lộ `"Buổi tới"`, warn badge giả, hay `"Đã kết thúc"` sai cho buổi tạm dừng.
- [x] Targeted E2E (`apps/e2e/specs/class-status.spec.ts` + `class-operations.spec.ts` nếu ảnh hưởng selector) pass trên port override; `pnpm design:compare --force --screens t-classes,t-class-detail --side both --label new` đạt mã `0`.
- [ ] Full local gates pass (`pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm build`) + `ak-code-review` + Kongming gates + Beta PR vào `develop` merge xanh CI/Staging + POT hoàn chỉnh trên issue `#694`.
