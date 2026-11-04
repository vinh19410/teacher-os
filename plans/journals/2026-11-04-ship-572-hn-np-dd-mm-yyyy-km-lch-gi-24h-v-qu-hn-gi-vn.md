---
title: "Ship #572: ô hạn nộp dd/mm/yyyy kèm lịch, giờ 24h và quá hạn giờ VN"
date: 2026-11-04
summary: "Hoàn tất TDD, E2E locale en-US, 3 viewport light/dark và mở PR beta lên develop cho #572"
---

# Ship #572: ô hạn nộp dd/mm/yyyy kèm lịch, giờ 24h và quá hạn giờ VN

## What happened
Hoàn tất triển khai, kiểm chứng E2E dưới locale `en-US`, xử lý toàn bộ 7 điểm review cục bộ (`0 Critical / 3 Important / 4 Minor`), merge sạch `origin/develop` (`a17086e8`), và mở PR beta lên `develop` cho issue #572.

- **UI & A11y (`@teacher-os/ui/components/date-picker-input`):** Xây dựng `DatePickerInput` (`dd/mm/yyyy` cố định + lịch tháng `T2..CN` trên `@base-ui/react/popover`, `z-[110]`, `align="end"`, `collisionPadding={8}`) và `TimeInput24h` (`HH:mm` 24h + nhóm `<fieldset>` mốc giờ gợi ý `17:00`/`21:00`/`23:59`). Cơ chế `draftText` + `lastEmittedRef` triệt tiêu hoàn toàn lỗi đảo ngày/tháng và nhảy con trỏ (`09/11` -> `10/09`) dưới locale `en-US`.
- **API, Server & Đồng bộ giờ Việt Nam:** Mở rộng `classAssignmentCreateSchema` thêm `dueTime?: HH:mm` (mặc định `"23:59"`), ghi `dueAt` vào cột `class_assignment.due_at` đã có sẵn mà không cần migration DB, chặn giờ quá khứ trong ngày (`400 past-time`, miễn trừ phút cuối ngày `23:59` VN hôm nay), và dùng chung `evaluateAssignmentDeadline` trên cả `apps/web` lẫn `apps/student` giữ nguyên lịch sử `dueAt: null`.

## Decision
- Khóa phạm vi #572 ở `ClassAssignmentsTab` (để bảo toàn 12+ spec E2E/unit của 7 modal chọn ngày khác cho đợt chuyển đổi riêng sau này).
- Ghi nhận ghi chú Informational từ Pre-Landing Review (`handleOpenChange` khi `disabled` bật giữa lúc mở lịch) vào mô tả PR cho đợt mở rộng `DatePickerInput` sang `<Modal>`.

## Next steps
- Chạy `ak-review-pr --fix --reply --advice`, gắn nhãn `ready to ship beta`, merge PR vào `develop` và theo dõi CI hội tụ xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
