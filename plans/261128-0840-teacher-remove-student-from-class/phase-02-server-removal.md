---
phase: 2
title: "Phase 2: Server Soft-Delete & Propagation"
status: done
priority: P1
effort: 2h
dependencies: [1]
---

# Phase 2: Server Soft-Delete & Propagation

## Goal

Cài đặt soft delete nguyên tử (`db.batch` forced-NULL CAS) cho `DELETE /api/enrollments/:enrollmentId` (giữ hard delete nguyên tử cho `invited`), bảo vệ quyền `canManageClassStatus`, giữ lịch sử điểm danh thực sự/bài đã nộp/hóa đơn, gỡ buổi chưa điểm danh/bài chưa nộp/media nháp, và cô lập hoàn toàn enrollment `removed` trên kernel, holidays, syllabus, reschedule, study-pack backfill & Student Portal.

## Files to Create / Modify

- Modify: `apps/server/src/kernel.test.ts` (cập nhật test `DELETE /api/enrollments/:id` trên `active`)
- Create: `apps/server/src/enrollment-removal.test.ts`
- Modify: `apps/server/src/routes/kernel.ts`
- Modify: `apps/server/src/routes/enrollment-activation.ts`
- Modify: `apps/server/src/lib/study-pack-assign.ts`
- Modify: `apps/server/src/routes/holidays.ts`
- Modify: `apps/server/src/lib/class-start-date-reschedule.ts`
- Modify: `apps/server/src/routes/syllabus.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/routes/student-class.ts`
- Modify: `apps/server/src/routes/snapshot.ts`

## Tests Before (TDD)

1. `DELETE /api/enrollments/:id` trên `active` trả `200 { ok: true }`: `status = 'removed'`, `removedAt != null`, `sessionPackage.status = 'cancelled'`, CHỈ giữ `lesson` `completed`/`absent`/có `attendance`/có `attendanceNote` khác rỗng, xóa mọi `lesson` `upcoming` hoặc `cancelled`/`holiday` chưa điểm danh, xóa `quiz_attempt` `in_progress` + thu hồi R2 `mediaKey` qua `.returning()`, xóa `class_assignment_target` chưa nộp (`NOT EXISTS` submitted attempt), giữ `submitted` & `practice` attempts + `invoice` + `payment_transaction`.
2. Gọi `DELETE /api/enrollments/:id` lần 2 trả `409 ENROLLMENT_ALREADY_REMOVED`; replay `DELETE` trên `E1` sau khi re-enroll `E2` không chạm tới target/attempt/lesson của `E2`; `ta` trả `403 FORBIDDEN`; cross-org/unknown trả `404`; lớp `paused` vẫn xóa được; `invited` vẫn hard-delete nguyên tử.
3. Re-enroll & Holidays & Syllabus & Reschedule:
   - `POST /classes/:id/enroll` trả `201` (org-scoped + `ne(status, 'removed')` trên cả `dupe` & `dupeAfter`); kích hoạt lại bỏ qua `priorDates` của `removed`, cập nhật `sessionPackage.total` chính xác, kể cả khi `POST/DELETE /classes/:id/sessions` ở lớp manual; re-enroll khi `total = 0` không khiến `backfillStuckEnrollments` lặp vô hạn.
   - `accept` (cả kernel & student) trên `removedId` trả `409 ENROLLMENT_ALREADY_REMOVED` ngay cả khi lớp `paused`; `POST /invoices` trả `409 ENROLLMENT_ALREADY_REMOVED`.
   - `holidays.ts` & `class-start-date-reschedule.ts` & `syllabus.ts` & `kernel.ts` (`bucketCounts`, `occurrenceUpdate`, `bucketStudentIds`, `findLessonAction`, `lessonStatusAction`, `POST /lessons/:id/edit`, `DELETE /classes/:id/sessions/:date`) cô lập đúng `removed`, không gửi notify hay sửa buổi lịch sử, không lỗi `MAKEUP_TOUCHED`/`invalid-schedule`.
4. Student Portal:
   - `GET /api/student/overview` loại cả lớp `removed` lẫn assignments của lớp `removed` (`loadClassAssignmentItems` mode `overview`).
   - `GET /assignments/:id/quiz`, `POST /quiz/start` (gồm race concurrent start-vs-delete), `GET /assignments/:id/audio` (chưa nộp), và mọi route ghi attempt (`PATCH /answer`, `PATCH /essay`, `PUT/DELETE /media`, `POST /submit`) trả `404` sau khi bị xóa.
   - `/invoices`, `/history`, `/attempts/:submittedId` (+ `/detail`, `/media`), và `/assignments/:submittedId/audio` vẫn truy cập bình thường.
5. `GET /api/kernel` trả `removedAt` trên enrollment.

## Implementation Steps

1. Viết test fail trước trong `apps/server/src/kernel.test.ts` và `apps/server/src/enrollment-removal.test.ts`.
2. Sửa `DELETE /api/enrollments/:enrollmentId` và các handler liên quan trong `apps/server/src/routes/kernel.ts` (forced-NULL CAS ở Statement 0 + `EXISTS (... status='removed')` + `.returning({ mediaKey })`; cập nhật `enroll`, `accept`, `bucketStudentIds`, `findLessonAction`, `lessonStatusAction`, `POST /lessons/:id/edit`, `bucketCounts` với `{ includeRemoved?: boolean }`, `occurrenceUpdate`, `PATCH /classes/:id`, `POST/DELETE /classes/:id/sessions`, `POST /invoices`).
3. Cập nhật `apps/server/src/routes/enrollment-activation.ts` & `apps/server/src/lib/study-pack-assign.ts` (tách `removed` trước `class-paused`, không trả `{ ok: true }` khi `enrAfter !== 'active'`, lọc `existingClassLessons` active, bỏ qua `priorDates`, backfill study-pack & class-assignment an toàn với `EXISTS` active enrollment).
4. Cập nhật `apps/server/src/routes/holidays.ts`, `apps/server/src/lib/class-start-date-reschedule.ts`, `apps/server/src/routes/syllabus.ts`.
5. Cập nhật `apps/server/src/routes/student.ts`, `apps/server/src/routes/student-class.ts`, `apps/server/src/routes/snapshot.ts`.

## Verification

- `pnpm --filter server test`
- `pnpm --filter server check-types`
