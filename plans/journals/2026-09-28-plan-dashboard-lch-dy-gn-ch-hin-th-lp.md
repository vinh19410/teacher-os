---
title: "Plan: dashboard lịch dạy gọn chỉ hiển thị lớp"
date: 2026-09-28
summary: "ak-plan fast mode cho việc bỏ avatar lớp + danh sách học viên trên /dashboard — plans/260928-0723, issue #278"
---

# Plan: dashboard lịch dạy gọn chỉ hiển thị lớp

## What happened
- User yêu cầu gọn lịch dạy trên `/dashboard`: bỏ avatar lớp học và danh sách học viên, card chỉ còn tên lớp + meta buổi học. Chạy `ak-plan --github`, auto-detect → fast mode, scope HOLD.
- Scout xác định toàn bộ UI nằm trong `apps/web/src/routes/_auth/dashboard.tsx`: avatar lớp ở dòng 107 (Lịch hôm nay) và 194 (Lịch sắp tới); student rows 115–148 (kèm nút "Điểm danh") và 204–213; kèm 2 early-return `studentRows.length === 0` (98, 185).
- Điểm rủi ro lớn nhất: nút "Điểm danh" nằm trong student list. Đọc kỹ e2e (`class-operations`, `schedule-session-modal`, `projected-sessions`) xác nhận các spec check-in đều chạy trên class detail + `/schedule` modal — không phụ thuộc nút trên dashboard → xóa list không làm mất chức năng, không phải sửa spec nào.
- Plan tạo tại `plans/260928-0723-dashboard-schedule-class-only/` (2 phases: dọn UI + kiểm chứng), `ak plan validate` hợp lệ, GitHub issue #278 tạo và link vào plan store (`teacher-os/260928-0723`).

## Decision
- Giữ nguyên section "Học viên rủi ro" (ngoài scope); không thêm CTA thay thế (không có "Điểm danh tất cả").
- Chấp nhận mất nút điểm danh nhanh trên dashboard vì user yêu cầu "đơn giản chỉ hiển thị lớp"; check-in vẫn đầy đủ ở 2 nơi khác.
- Bỏ early-return ẩn card khi thiếu student record — hành vi mới đúng ngữ nghĩa "chỉ hiển thị lớp".

## Next steps
- Cook plan: `/ak:cook plans/260928-0723-dashboard-schedule-class-only/plan.md` trên branch `feat/dashboard-schedule-class-only`.
- Verification gates: `pnpm check`, `pnpm --filter web check-types`, `pnpm --filter web test`, e2e smoke + 3 spec check-in.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
