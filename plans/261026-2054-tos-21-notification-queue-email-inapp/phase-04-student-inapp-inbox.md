---
phase: 4
title: "In-app học viên: API inbox, chuông thông báo, đánh dấu đã xem"
status: pending
priority: P0
effort: "4h"
dependencies: ["phase-02"]
---

# Phase 4: In-app trên cổng học viên

## Files

- Modify: `apps/server/src/routes/student.ts`
  - `GET /api/student/inbox` — bản ghi của `studentCtx.student.id` trong `studentCtx.orgId`, mới nhất trước, 50 dòng; trả `{ items, unread }` (`unread` = `read_at IS NULL`). Không trả `recipient_email`, `reply_to_email`, `last_error`.
  - `POST /api/student/inbox/:id/read` — chỉ bản ghi của chính học viên (khác → 404); đặt `read_at` nếu trống; `status = 'sent'` → `'read'`; idempotent. Gắn cùng CSRF guard Origin như `/invitations/*`.
- Modify: `apps/student/src/lib/repos/student.ts` — `useStudentInbox`, `useMarkInboxRead` (invalidate inbox).
- Modify: `apps/student/src/components/layout/notification-bell.tsx` — panel 2 phần: "Lời mời" (giữ nguyên logic) và "Thông báo" (tiêu đề, nội dung 2 dòng, thời gian tương đối, chấm chưa đọc). Badge = lời mời pending + `unread`, `aria-hidden` cho số, `aria-label` của nút mô tả số lượng. Bấm item → mark read → `navigate(linkPath)`. Trạng thái loading / rỗng ("Chưa có thông báo").
- Test: `apps/server/src/routes/student-inbox.test.ts`, `apps/student/src/components/layout/notification-bell.test.tsx`.

## Steps

1. Test đỏ: học viên A không thấy bản ghi của B / org khác; mark read của người khác → 404; mark read bản ghi `queued` → `read_at` có, `status` vẫn `queued`; bản ghi `sent` → `read`; chuông hiển thị badge đúng, bấm item gọi mutation và điều hướng.
2. Viết code; theo token `DESIGN.md`, verify 1440 / 768 / 375 + focus bàn phím (Esc đóng panel đã có).

## Verification

- `pnpm --filter server test -- student-inbox`
- `pnpm --filter student test -- notification-bell`
- `pnpm check`, `pnpm check-types`
