---
title: "Thêm học viên thủ công, kích hoạt lớp tức thì & bài nộp mẫu dùng thử Chấm điểm"
description: "Mở lại luồng thêm học viên thủ công trên app giáo viên (tự khớp Student Portal qua email), cho phép ghi danh & kích hoạt Đang học ngay lập tức, và bổ sung nút tạo/xóa bài nộp mẫu dùng thử trên /grading không tốn credit AI."
status: completed
priority: P1
effort: 10h
issue: 508
branch: vinh19410/ai-handle-issue-508
tags: [feature, api, backend, frontend, e2e]
blockedBy: []
blocks: []
created: 2026-10-30
---

# Thêm học viên thủ công, kích hoạt lớp tức thì & bài nộp mẫu dùng thử Chấm điểm

## Overview

Sau khi PR #257 xoá `POST /api/students` và PR #263 chuyển sang `POST /api/students/invite`, giáo viên mới hoặc giáo viên dạy học viên chưa có tài khoản Student Portal rơi vào trạng thái cold-start: không có bản ghi `student` trong org dẫn tới không ghi danh vào lớp được (`EnrollStudentModal` rỗng), không lập được hóa đơn (`POST /api/invoices` đòi `enrollment.status === 'active'`), không giao được bài tập (`POST /api/classes/:id/assignments` đòi `studentIds` thuộc `enrollment` `active`), và trang `/grading` trống hoàn toàn.

Kế hoạch này giải quyết triệt để qua 2 trụ cột (Phương án A + C từ brainstorm `plans/reports/brainstorm-261030-manual-student-and-trial-grading.md`):
1. **Tạo học viên thủ công & Kích hoạt lớp tức thì (`POST /api/students`, mở rộng `POST /api/classes/:id/enroll`):** Chỉ bắt buộc Họ tên (`name`); SĐT, Email, Phụ huynh là tùy chọn. Cho phép chọn lớp và kích hoạt trạng thái `active` ngay lập tức (tái sử dụng `activateEnrollment` để sinh `session_package` và `lesson`). Nếu có nhập Email, tự động đóng lời mời `pending` trùng email trong org và tự động khớp nối khi học viên đăng nhập Student Portal bằng email đã xác thực.
2. **Bài nộp mẫu dùng thử trên `/grading` (`POST / DELETE /api/grading/demo-sample`):** Cung cấp nút tạo nhanh 1 bài nộp Writing Task 2 mẫu (`mode = 'practice'`, kèm bản nháp chấm AI cố định `status = 'ai_drafted'`, `creditCost = 0`) dùng bộ ID tất định theo org (`demo-*:${orgId}`). Bộ lọc tại `loadSnapshot` và `computeReminders` đảm bảo dữ liệu mẫu chỉ hiện trên `/grading`, không làm bẩn danh sách học viên, ngân hàng đề, hóa đơn hay thẻ nhắc việc Dashboard, và xóa sạch bằng 1 chạm.

## Decisions

| # | Quyết định | Nội dung |
|---|-----------|----------|
| D1 | Khôi phục `POST /api/students` org-scoped | Chỉ bắt buộc `name` (1–120 ký tự); `phone`, `email`, `parentName`, `parentPhone` tùy chọn (`default("")`). Email chuẩn hóa `lower(trim(email))`; nếu khác rỗng và trùng học viên trong cùng `orgId` (không tính `demo-student:*`) → trả `409 STUDENT_ALREADY_IN_ORG` kèm `existingStudentName`. Khi race condition xảy ra lúc insert, re-query bảng `student` theo `(orgId, normalizedEmail)` để trả `409` chính xác mà không nuốt nhầm lỗi FK/NOT NULL. |
| D2 | Tự đóng lời mời `pending` khi tạo tay | Trong cùng `db.batch` tạo `student`, nếu `email !== ""` thì chạy `UPDATE student_invitation SET status = 'accepted' WHERE org_id = ctx.orgId AND lower(trim(email)) = normalizedEmail AND status = 'pending'` để không còn lời mời mồ côi. |
| D3 | Ghi danh & Kích hoạt `active` ngay lập tức | `studentCreateSchema` nhận `classId?: string` và `activateNow: boolean` (mặc định `true`); `enrollStudentSchema` nhận thêm `activateNow?: boolean` (mặc định `false` trên wire để giữ tương thích ngược 100% với test server và E2E chọn học viên có sẵn, còn chế độ Tạo học viên mới trong `EnrollStudentModal` và `AddStudentModal` bật sẵn `true`). Khi `activateNow === true`: ghi `enrollment` (`status: 'invited'`) rồi gọi `activateEnrollment(db, ctx.orgId, enrollmentId)`; nếu `!act.ok` thì trả `500` (không trả `201` nửa vời), và chỉ bắn `classEnrolledEvent` ("Được mời vào lớp") khi `!activateNow` (trạng thái còn `invited`). |
| D4 | Defense-in-depth cho `createStudentGuard` | Bổ sung kiểm tra `sessionUser.emailVerified === true` ngay đầu `createStudentGuard` (`apps/server/src/routes/student.ts`) bên cạnh middleware `router.use("*")` hiện có. |
| D5 | Cô lập bài nộp mẫu `/grading` bằng ID tất định `demo-*:${orgId}` | Không thêm cột schema hay chạy migration D1. Dùng 5 ID tất định theo `orgId` (`demo-student:${orgId}`, `demo-prompt:${orgId}`, `demo-test:${orgId}`, `demo-test-part:${orgId}`, `demo-attempt:${orgId}`). `loadSnapshot` lọc bỏ `demo-student:%`, `demo-prompt:%`, `demo-test:%`; `computeReminders` lọc bỏ `demo-attempt:%`; `POST /api/grading/:attemptId/grade` bỏ qua `emitNotifications` với `demo-attempt:%`. Bản nháp AI mẫu ghi thẳng `status = 'ai_drafted'`, `creditCost = 0`, không gọi model AI thật. |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Contracts & Server API tạo học viên thủ công + kích hoạt ngay](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Web UI tạo học viên thủ công & modal thêm vào lớp](./phase-02-web-student-and-enroll-ui.md) | Completed |
| 3 | [Phase 3: API & Web UI bài nộp mẫu dùng thử trên /grading](./phase-03-demo-grading-sample.md) | Completed |
| 4 | [Phase 4: E2E, kiểm tra 3 viewport & cổng chất lượng toàn diện](./phase-04-e2e-and-regression-gates.md) | Completed |

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| Supersedes D4 of | `260923-0758-students-from-portal-registration` (giữ portal bridge, mở lại tạo học viên thủ công) | completed |
| Extends | `260923-0550-enrollment-invite-accept-flow` & `260924-0556-student-org-invite-and-switch` | completed |

## Success Criteria

- [x] `POST /api/students` tạo học viên mới với chỉ `name` bắt buộc; trả `409 STUDENT_ALREADY_IN_ORG` khi trùng email trong cùng org; tự chuyển `student_invitation` `pending` cùng email sang `accepted`.
- [x] Tạo học viên kèm `classId` + `activateNow: true` (hoặc `POST /api/classes/:id/enroll` với `activateNow: true`) kích hoạt luôn `enrollment.status = 'active'`, sinh `session_package` và `lesson`, mở khóa ngay `POST /api/invoices` và `POST /api/classes/:id/assignments`.
- [x] Trang `/students` có nút **+ Thêm học viên** mở `AddStudentModal`; `EnrollStudentModal` trên `/classes/$classId` sửa thông báo khi org rỗng và cho phép chuyển sang chế độ **Tạo học viên mới** (mặc định bật `activateNow`) hoặc chọn học viên có sẵn kèm checkbox **Kích hoạt trạng thái Đang học ngay** (mặc định tắt ở chế độ chọn học viên có sẵn để giữ nguyên luồng mời-rồi-kích-hoạt của E2E hiện hữu).
- [x] `POST /api/grading/demo-sample` tạo idempotent 1 bài nộp Writing Task 2 mẫu (`demo-attempt:${orgId}`) kèm `ai_grading_draft` (`status = 'ai_drafted'`, `creditCost = 0`) hiện ngay trong `/grading` mà không xuất hiện ở `/students`, `/assignments` hay thẻ nhắc việc Dashboard; `DELETE /api/grading/demo-sample` xóa sạch bộ mẫu.
- [x] Toàn bộ `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` và spec E2E mới đều xanh.

## Red Team Review

### Session — 2026-10-30 (Kongming `--advice` + Adversarial Review)

| # | Finding | Severity | Evidence | Disposition | Applied To |
|---|---------|----------|----------|-------------|------------|
| B1 | Test cũ trong `kernel.test.ts` khẳng định `POST /api/students` trả 404 sẽ fail ngay khi khôi phục route | Critical | `apps/server/src/kernel.test.ts:4981` | Accept — cập nhật test tại `kernel.test.ts:4981` sang kiểm tra tạo học viên trả 201 | Phase 1 Task 1.4 |
| B2 | Nếu `activateEnrollment` trả `{ ok: false }` mà API vẫn trả `201`, UI đóng modal khiến giáo viên tưởng đã `active` | High | `apps/server/src/routes/enrollment-activation.ts:256-257` | Accept — nếu `!act.ok` thì trả `500`, đảm bảo `201` với `activateNow: true` luôn đồng nghĩa đã kích hoạt thành công | Phase 1 Task 1.2, Phase 2 Task 2.2 |
| B3 | Bắt `isRollbackableConstraintError` để trả 409 sẽ nuốt nhầm lỗi `NOT NULL` / `FOREIGN KEY` thành lỗi trùng email | High | `apps/server/src/routes/holidays.ts:406-408`, `apps/server/src/routes/kernel.ts:1252` | Accept — dùng đúng pattern re-query bảng `student` theo `(orgId, normalizedEmail)` trong `catch` trước khi trả 409 | Phase 1 Task 1.2 |
| M1 | Thiếu bước test tường minh cho `createStudentGuard` từ chối `emailVerified: false` khi đã có `student` trùng email | Medium | `apps/server/src/routes/student.ts:120-168` | Accept — bổ sung test 403 `EMAIL_UNVERIFIED` trong `student.test.ts` | Phase 1 Task 1.4 |
| M2 | Gửi `classEnrolledEvent` ("Được mời vào lớp... Vào cổng học viên để kích hoạt") khi `activateNow: true` gây hiểu nhầm vì học viên đã được kích hoạt | Medium | `apps/server/src/lib/notifications/templates.ts:55-70` | Accept — chỉ phát `classEnrolledEvent` khi `!activateNow` (trạng thái còn `invited`) | Phase 1 Task 1.2 |
| M3 | Các task trung gian chỉ dùng `check-types` làm `Verify` thay vì đánh dấu `no verification needed` (covered by task test cuối phase) theo chuẩn `advice-handover-plan` | Medium | `phase-01-start.md`, `phase-02-web-student-and-enroll-ui.md`, `phase-03-demo-grading-sample.md` | Accept — chuẩn hóa `Verify` ở mọi task | Phase 1, 2, 3, 4 |
| M4 | Lọc `demo-student:%` trong `student-provisioning.ts` là thừa vì học viên mẫu có `email = ""` và `provisionStudentForUser` đã bỏ qua email rỗng | Low | `apps/server/src/student-provisioning.ts:21-24` | Accept — bỏ sửa `student-provisioning.ts`, chỉ giữ lọc tại `snapshot.ts` và `dashboard-reminders.ts` | Phase 1 Task 1.3, Phase 3 Task 3.1 |

### Whole-Plan Consistency Sweep
- Đã rà soát toàn bộ `plan.md` và `phase-01` → `phase-04` sau khi áp dụng 7 findings (B1–B3, M1–M4).
- Đã loại bỏ `apps/server/src/student-provisioning.ts` khỏi danh sách file sửa của Phase 1.
- Đã đồng bộ hành vi `activateNow` và race-backstop 409 giữa `plan.md` (D1, D3) và `phase-01-start.md` (Task 1.2, Task 1.4).
- Không còn mâu thuẫn giữa các phase.

## Validation Log

### Verification Results
- Claims checked: 22
- Verified: 22 | Failed: 0 | Unverified: 0
- Tier: Standard (4 phases)
- Key verified anchors:
  - `packages/db/src/schema/student.ts:57-59` (`student_org_email_uq` partial unique index `WHERE trim(email) != ''`)
  - `apps/server/src/routes/kernel.ts:316-387` (`POST /students/invite`), `440-491` (`POST /classes/:id/enroll`), `4981` in `kernel.test.ts`
  - `apps/server/src/routes/enrollment-activation.ts:272` (`activateEnrollment`)
  - `apps/server/src/routes/grading.ts:93-204` (`loadGradingQueue`), `428-604` (`loadGradableAttempt`), `724-856` (`POST /:attemptId/grade`)
  - `apps/server/src/routes/snapshot.ts:224-356` (`loadSnapshot`)
  - `apps/server/src/routes/dashboard-reminders.ts:77-215` (`computeReminders`)

<!-- slug: manual-student-and-trial-grading -->
