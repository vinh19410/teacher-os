---
title: "Cho phép giáo viên xóa học viên ra khỏi lớp học (Soft Delete)"
description: "Cho phép giáo viên xóa học viên đang học (active) khỏi lớp học qua soft delete enrollment.status='removed', giữ lịch sử điểm danh/bài đã nộp/học phí và gỡ buổi sắp tới/bài chưa nộp."
status: in-progress
priority: P1
effort: 5h
branch: vinh19410/feat-teacher-remove-student
tags: [feature, backend, database, frontend, api]
blockedBy: []
blocks: []
created: 2026-11-28
---

# Cho phép giáo viên xóa học viên ra khỏi lớp học (Soft Delete)

## Overview

Tính năng cho phép giáo viên (và các vai trò quản lý lớp: `teacher`, `owner`, `admin`, `class_teacher`) xóa học viên đang học (`active`) ra khỏi lớp học tại tab **Học viên** của trang chi tiết lớp (`/classes/$classId?tab=roster`). Hệ thống dùng soft delete (`enrollment.status = 'removed'`, `removed_at = now`) để bảo toàn lịch sử điểm danh các buổi đã học (`completed`, `absent`, hoặc có `attendance` / `attendance_note`), bài tập đã nộp/đã chấm, hồ sơ học viên và toàn bộ hóa đơn học phí; đồng thời hủy gói buổi đang mở (`session_package.status = 'cancelled'`), gỡ các buổi chưa điểm danh (`upcoming`, `cancelled` / `holiday` chưa điểm danh) và bài tập chưa nộp của lớp, và cho phép thêm lại học viên vào lớp đó về sau.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Schema & migration hỗ trợ `enrollment.status = 'removed'`, `removed_at` và partial unique index cho phép re-enroll | P1 |
| 2 | Server `DELETE /api/enrollments/:id` soft-delete nguyên tử (forced-NULL CAS) + cô lập hoàn toàn enrollment `removed` trên kernel, holidays, syllabus, reschedule & portal học viên | P1 |
| 3 | Giao diện `ClassRosterTab` thêm nút "Xóa khỏi lớp", modal xác nhận kèm cảnh báo công nợ chưa thu; `StudentTuitionSummary` giữ dòng nợ cũ `"Đã rời lớp"` | P1 |
| 4 | Kiểm thử đầy đủ (DB/API/Server/Web/Student/E2E lẻ/screenshot/design:compare) và ship dual-stage (`beta` -> `develop`, `official` -> `main`) kèm POT | P1 |

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Phase 1: Schema, Migration & API Contracts](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Server Soft-Delete & Propagation](./phase-02-server-removal.md) | Pending |
| 3 | [Phase 3: Web Repos, Tuition & Roster UI](./phase-03-web-roster-ui.md) | Pending |
| 4 | [Phase 4: Verification, Review & Dual-Stage Ship](./phase-04-verification-and-ship.md) | Pending |

## Success Criteria

- [ ] `enrollment` có cột `removed_at` và partial unique index `enrollment_class_student_uq` (`WHERE status != 'removed'`) qua migration forward-only không rebuild bảng.
- [ ] `DELETE /api/enrollments/:id` kiểm tra quyền `canManageClassStatus`, giữ nguyên hard-delete nguyên tử cho `invited`, và soft-delete nguyên tử (`db.batch` forced-NULL CAS) cho `active` (giữ buổi `completed`/`absent`/có `attendance`/`attendance_note`; xóa `upcoming`/chưa điểm danh; `cancelled` gói buổi; xóa `in_progress` attempts + R2 media qua `.returning()`; xóa targets chưa nộp kèm `NOT EXISTS` submitted attempt; giữ hóa đơn).
- [ ] Gọi `DELETE /api/enrollments/:id` lần 2 hoặc replay `E1` sau re-enroll `E2` trả `409 ENROLLMENT_ALREADY_REMOVED` và không chạm dữ liệu `E2`; `ta` trả `403 FORBIDDEN`.
- [ ] `holidays.ts`, `syllabus.ts`, `class-start-date-reschedule.ts`, `kernel.ts` (`bucketCounts`, `occurrenceUpdate`, `POST/DELETE /classes/:id/sessions`), `enrollment-activation.ts` và `study-pack-assign.ts` cô lập đúng enrollment `removed` và không ghi đè gói buổi/lịch sử khi re-enroll hoặc đóng băng `startDate`/`holidays` ở lớp chưa học.
- [ ] Học viên bị xóa không còn thấy lớp hoặc bài của lớp trên Student Overview, không thể mở/start/lưu/nộp quiz chưa nộp (`404`), nhưng vẫn xem được hóa đơn, `/history`, bài đã nộp/đã chấm và audio/media của bài đã nộp.
- [ ] Tab Học viên (`/classes/$classId?tab=roster`) hiển thị nút "Xóa khỏi lớp" cho vai trò được phép (kể cả khi lớp `paused`), modal cảnh báo công nợ chưa thu nếu có; tab Học phí của hồ sơ học viên vẫn hiển thị dòng `"Đã rời lớp"` khi còn hóa đơn cũ mà không làm phình tổng phí lớp đang học.
- [ ] Tất cả gate (`db`, `api`, `server`, `web`, `student` test, `biome check`, `check-types`, E2E lẻ, `design:compare`, `code-review`) đều pass và hoàn tất ship beta + stable kèm POT trên GitHub issue.

## Red Team Review

Đợt review đối kháng với 3 `code-reviewer` subagent độc lập (Security Adversary `92b609e0`, Failure Mode Analyst `f16b1968`, Assumption Destroyer `ce228c6c`) đã đối chiếu trực tiếp mã nguồn:

- **Chấp nhận & đã tích hợp vào plan (Steps 0–4):**
  1. *(Security F1)* D1 `db.batch` không tự rollback khi `UPDATE` khớp 0 dòng → đổi Statement 0 của `DELETE /api/enrollments/:id` sang forced NOT NULL violation (`CASE WHEN status = 'active' THEN 'removed' ELSE NULL END`) và ràng điều kiện `EXISTS (... status = 'removed')` ở các DELETE statements sau để chặn race replay `E1` xóa nhầm dữ liệu `E2`.
  2. *(Assumptions F2)* Race giữa R2 pre-read và `PUT /media` → bỏ pre-read R2, thu thập `mediaKey` qua `.returning({ mediaKey: quizAttempt.mediaKey })` ngay trong `db.batch`, chỉ xóa best-effort sau khi batch thành công.
  3. *(FailureModes F1/F2/F5, Security F2/F4/F5, Assumptions F1/F4/F5)* Quy tắc giữ lại `cancelled`/`holiday` quá khứ gây kẹt `holidays.ts` (`MAKEUP_TOUCHED` / blocked shifts), `class-start-date-reschedule.ts`, `syllabus.ts`, `kernel.ts` → đơn giản hóa quy tắc giữ buổi: CHỈ giữ buổi thực sự đã điểm danh/ghi nhận (`completed`, `absent`, `attendance IS NOT NULL`, `attendance_note != ''`), xóa hết `upcoming` và `cancelled`/`holiday` không có điểm danh; đồng thời thêm lọc `enrollment.status = 'active'` vào `holidays.ts`, `existingClassLessons`, `class-start-date-reschedule.ts`, `syllabus.ts` (`backfillStuckEnrollments`, `overwriteManualSessions`, `removeCurriculumHandler`), `kernel.ts` (`bucketCounts` tách default active vs `{ includeRemoved: true }` cho date-occupancy check, `occurrenceUpdate`, `POST/DELETE /classes/:id/sessions` tính `sessionPackage.total` theo từng enrollment).
  4. *(FailureModes F3, Security F3, Assumptions F4)* Race `activateEnrollment` vs `DELETE` & lỗi `409 CLASS_PAUSED` giả trên enrollment `removed` ở lớp paused → check `status === 'removed'` trước `cls.status` trong `activateEnrollment`; bắt `enrAfter !== 'active'` trả lỗi riêng (không bao giờ `{ ok: true }`); lọc `enrollment.status = 'active'` trong `backfillStudyPackTargetsForStudent` & `backfillClassAssignmentTargetsForStudent` kèm atomic `WHERE EXISTS`; sửa cả `dupe` & `dupeAfter` trong `POST /classes/:id/enroll` (`orgId` + `ne(status, 'removed')`) và thông báo lỗi riêng trên `POST /invoices`.
  5. *(FailureModes F4, Security F6#1, Assumptions F2)* Lỗ hổng Student Portal → thêm check `enrollment.status = 'active'` trong `loadClassAssignmentItems` (`mode = 'overview'`), `GET /assignments/:id/quiz`, `POST /quiz/start` (kèm CAS NOT NULL `mode` khi insert), `GET /assignments/:id/audio` (hoặc đã `submitted`), và `loadOwnedAttemptWithSkill` + atomic `WHERE EXISTS` trên `PATCH /answer`, `PATCH /essay`, `PUT/DELETE /media`, `POST /submit` (vẫn cho phép xem/nghe `submitted` attempts & media).
  6. *(FailureModes F6, Security F7, Assumptions F3/F6)* `studentTuitionSummary` mất công nợ cũ của enrollment `removed` → giữ enrollment `removed` CÓ hóa đơn trong `studentTuitionSummary` (theo từng `eid`, `counted: false`, badge `"Đã rời lớp"`) để không ẩn nợ trên `/students/$studentId?tab=tuition`; dùng `canManageClassStatus(data.viewer?.role ?? "teacher")` trong `ClassRosterTab`; thêm nhánh `403` + `ENROLLMENT_ALREADY_REMOVED`/`STATUS_CHANGED` vào `kernel-outcome.ts`.
- **Xác minh & Bác bỏ (có bằng chứng):**
  - *(Security F6#2)* Đề xuất lọc bỏ `removed` ngay trong `mapEnrollments`: bác bỏ vì `apps/web/src/components/modals/add-invoice-modal.tsx:48` đã lọc `.filter((e) => e.status === "active")`, trong khi `mapLessons`, `debtLedger`, `tuition/$invoiceId.tsx`, và `studentTuitionSummary` cần các dòng `removed` trong `data.enrollments` để ánh xạ tên lớp và học viên cho lịch sử & hóa đơn đã bảo toàn.

## Validation Log

- `[2026-11-28]` Khởi tạo & validate cấu trúc plan ban đầu (`ak plan validate`: pass).
- `[2026-11-28]` Hoàn tất Red Team Review 3 góc nhìn (`92b609e0`, `f16b1968`, `ce228c6c`) → phát hiện 6–7 lỗ hổng race/propagation/UX thực tế; tích hợp đầy đủ vào plan sửa đổi.

## Risks & Mitigations

- **Partial unique index trên SQLite/D1 qua Drizzle:** kiểm tra trực tiếp SQL sinh ra trong `packages/db/src/migrations/0101_*.sql`, chỉ chấp nhận `DROP INDEX` + `ALTER TABLE ADD` + `CREATE UNIQUE INDEX ... WHERE`.
- **Giới hạn 100 binds của Cloudflare D1:** trong `holidays.ts` (`shiftStatements`, `cancelStatements`, `DELETE /holidays/:id`), thêm join/subquery `enrollment.status = 'active'` giữ số binds mỗi câu dưới trần 100.
- **Rollback:** forward-only migration; rollback logic ở tầng app bằng revert PR nếu cần.

<!-- slug: teacher-remove-student-from-class -->
