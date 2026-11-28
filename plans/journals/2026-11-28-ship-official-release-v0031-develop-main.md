---
title: Ship official release v0.0.31 (develop → main)
date: 2026-11-28
summary: "Chuẩn bị bản phát hành 0.0.31 với redesign ngân hàng bài tập, trang từ vựng học viên và sửa checkbox modal giao bài"
---

# Ship official release v0.0.31 (develop → main)

## Phạm vi

Promote `develop` lên `main`, bump 0.0.30 → 0.0.31: sửa checkbox modal giao bài + chọn-tất-cả ba trạng thái (#1041, issue #982); redesign trang tổng quan từ vựng học viên (#1044, issue #1042); redesign ngân hàng bài tập giáo viên + `DELETE /api/assignments/prompts/:id` xoá nháp nguyên tử (#1045, issue #1043, #979). #983 vẫn mở. Không có migration D1, không đổi infra/CI nên không cần dừng chờ backup D1.

## Quá trình

- Gộp `origin/main` vào `develop` (`70748c2c`) không đổi nội dung mã.
- Gate local trên `70748c2c`: `pnpm exec biome check .` exit 0 (157 warning, 17 info), `pnpm check-types` 14/14, `pnpm test` 13/13 task (server 1945 qua + 1 expected fail, web 2619, student 807, admin 257, auth 140, lms 53). Không chạy full E2E ở local.
- Review trước phát hành: 0 Critical, 0 High, 2 Medium, 4 Low. M1: tab học viên mở từ trước deploy sẽ lỗi trang tổng quan từ vựng tới khi reload, vì schema client cũ dùng `.strict()` và từ chối field mới. M2: xoá prompt nháp để lại object audio mồ côi trong R2.
- Cập nhật docs: quy tắc xoá nháp trong `docs/project-overview-pdr.md`, nhãn route trong `docs/system-architecture.md` và `docs/codebase-summary.md`; CHANGELOG bổ sung mục #1042 còn thiếu.

## Việc tiếp theo

- Tạo PR `develop` → `main`, merge và deploy production (chưa thực hiện lúc viết).
- Sau deploy: mở trang từ vựng học viên, thử xoá một bài nháp trong ngân hàng bài tập.
- Theo dõi M1 (nới `.strict()` cho response schema phía client) và M2 (dọn audio R2 khi xoá nháp) ở issue riêng.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
