---
title: "Ship #574: Gộp trắc nghiệm + Writing trong một bài tập (beta)"
date: 2026-11-04
summary: "Hoàn tất 4 phase TDD, merge origin/develop + migration 0063, pass toàn bộ unit/typecheck/E2E + code review Approved"
---

# Ship #574: Gộp trắc nghiệm + Writing trong một bài tập (beta)

## Tóm tắt hoàn thành (#574)
- Hoàn thành trọn luồng tạo, xem trước (cả tab mô phỏng), giao lớp, làm bài 2 autosave store, chấm tự động + chấm nháp AI (guard 0-Credit khi bài gộp để trống phần Writing) + chấm tay kèm dòng điểm trắc nghiệm `objective`, và hiển thị kết quả cả 2 phần ở summary, `/detail` và `/history`.
- Đã merge `origin/develop` (giữ nguyên `item.explanation` của #571 và sinh migration `0063_green_ghost_rider.sql` nối sau `0062_perfect_mentor.sql`), giải quyết toàn bộ 6 findings từ `LocalCodeReviewer` (`Approved`: `0 Critical / 0 Important / 0 unresolved Minor`) và cập nhật `docs/project-overview-pdr.md` + `CHANGELOG.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
