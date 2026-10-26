---
phase: 5
title: "Scenario 2 — TA chỉ thấy lớp phân công, ẩn thẻ học phí"
status: blocked
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 5: Phạm vi Trợ giảng (bị chặn)

## Goal

Khi người đăng nhập là Trợ giảng phụ trách lớp "IELTS 6.5A":
- Bộ đếm chỉ tính ca học và bài nộp của lớp đó.
- Response `/api/dashboard/reminders` không có block `tuition`, nên trình duyệt không nhận dữ liệu công nợ.
- Thẻ học phí bị ẩn.

## Điều kiện mở khoá

Phase này chỉ chạy khi plan FR-selfomy-alignment-029 đã có ba thứ sau:
1. Vai trò trung tâm trên `membership.role`: `owner | staff | teacher | ta`.
2. Bảng phân công nhân sự theo lớp (`ClassStaffAssignment` trong `docs/selfomy-alignment/srs/selfomy-alignment-erd.md`).
3. Chính sách cô lập dữ liệu kernel snapshot cho Teacher/TA. Nếu thiếu mục này, kernel snapshot vẫn gửi hoá đơn về trình duyệt và Scenario 2 vẫn chưa đạt, dù API reminders đã chặn.

## Files to Modify (khi mở khoá)

- `apps/server/src/routes/dashboard-reminders.ts`: thay `resolveReminderScope(ctx)`.
  - `ta` → `{ kind: "assigned", classIds, finance: false }`.
  - `teacher` (giáo viên đứng lớp của trung tâm) → `assigned` theo lớp phân công. Quyền tài chính theo quyết định của plan FR-029.
  - `owner | staff` → `{ kind: "org" }`.
- `apps/server/src/routes/dashboard-reminders.test.ts`: test với session TA thật.
- `apps/e2e/specs/dashboard-reminders.spec.ts`: thêm case TA. Assert không có thẻ học phí và assert response JSON không có key `tuition` (qua `page.waitForResponse`).

## Verification

- `pnpm --filter server test -- dashboard-reminders`
- `pnpm --filter e2e e2e -- dashboard-reminders`
