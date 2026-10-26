---
phase: 3
title: "Nối 4 sự kiện chính vào hàng đợi thông báo"
status: completed
priority: P0
effort: "5h"
dependencies: ["phase-02"]
---

# Phase 3: Nối sự kiện

Mỗi điểm gọi `emitNotifications(deps, ctx.orgId, events)` **sau** khi ghi nghiệp vụ thành công, trước `return c.json(...)`. Không đổi response hiện có.

| Sự kiện (group) | Route | `event_type` / khóa | Người nhận |
|---|---|---|---|
| Mời vào lớp (`class_invite`) | `POST /api/classes/:id/enroll` (`apps/server/src/routes/kernel.ts`) | `class_enrolled:<enrollmentId>` | học viên được ghi danh |
| Giao bài (`assignment`) | `POST /api/classes/:id/assignments` (`kernel.ts`) | `assignment_published:<classAssignmentId>:<studentId>` | học viên đích (theo `classAssignmentTarget`, hoặc cả lớp đang `active`) |
| Trả điểm (`assignment`) | `POST /api/grading/:attemptId/grade` (`routes/grading.ts`), `POST /api/assignments/:id/grade` (`routes/assignments/index.ts`) | `grade_returned:<attemptId>` (khóa canonical duy nhất — cả 2 route đều phát theo attempt; route chấm cả assignment fan-out từng attempt/thành viên 1 bản ghi) | học viên của bài |
| Hóa đơn (`tuition`) | `POST /api/invoices` (`kernel.ts`) | `invoice_issued:<invoiceId>` | học viên của enrollment |
| Đổi lịch (`schedule`) | `POST /api/lessons/:id/edit`, `POST /api/classes/:id/sessions/:date/edit`, `POST /api/classes/:id/sessions/:date/cancel`, `POST /api/lessons/:id/cancel` | `schedule_changed:<classId>:<date>:<editedAtMs>:<studentId>` | học viên có dòng lesson bị đổi; chỉ phát khi `date`/`time` đổi hoặc hủy |
| Lịch nghỉ (`schedule`) | `POST /api/holidays` (TOS-11 #445) khi `notify = true` | `holiday_created:<holidayId>:<studentId>` | học viên các lớp bị ảnh hưởng |

Lịch nghỉ: nếu #445 chưa merge khi làm phase này → chỉ thêm builder `holidayCreatedEvents(...)` + test, rồi comment vào #445 yêu cầu gọi `emitNotifications` trong handler apply.

## Steps

1. Test đỏ trong file test sẵn có của từng route (`student-class.test.ts`, `grading.test.ts`, `invoice-payment.test.ts`, `kernel-occurrence.test.ts`…): sau request thành công có đúng số dòng `notification_record` với `event_type` đúng; gọi lại (khi route idempotent) không tạo thêm; request thất bại (404/409) → 0 dòng; enqueue ném lỗi (stub) → request vẫn 2xx.
2. Thêm lời gọi `emitNotifications` vào từng route.

## Verification

- `pnpm --filter server test`
- `pnpm check`, `pnpm check-types`
