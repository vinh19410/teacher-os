---
title: "Ship #559 remove examenglish block from profile form"
date: 2026-11-04
summary: "Xoá khối ExamEnglish khỏi form đăng ký apps/profile và thêm vm.Script compile guard (#559)"
---

# Ship #559 remove examenglish block from profile form

## What happened
Thực thi issue #559 xoá hoàn toàn khối tuỳ chọn `<details id="examEnglishDetails">` ("Đã làm test examenglish?"), 2 liên kết ExamEnglish, CSS `.examenglish-*` và logic lưu/khôi phục nháp `examEnglish` khỏi `apps/profile/public/index.html`.

## Decision
- **Giữ nguyên tên hàm `getCombinedPlacement()` và `.trim().slice(0, 300)`:** Bảo toàn cả 3 điểm gọi (`buildFallbackZaloMessage`, `renderSuccessSummary`, và handler `submit`) và tránh vi phạm giới hạn `LEAD_PLACEMENT_MAX = 300` trên `POST /public/leads` khi `restoreDraft()` nạp chuỗi dài từ `localStorage`.
- **Thêm kiểm tra biên dịch `new vm.Script` trong `apps/profile/tests/index.test.mjs`:** Trong bước Red Team phát hiện `biome.json:37` có `"!**/apps/profile/public/index.html"` nên `biome check .` không quét JS inline của trang profile. Bổ sung test trích xuất các khối `<script>` JS cổ điển inline và biên dịch qua `node:vm` để chặn `SyntaxError` (ngăn lỗi rơi về native `GET` làm lộ PII trên URL), theo đúng Scope Lock thu gọn của Kongming.

## Verification & Next steps
- `pnpm --filter profile test` (19/19 pass), `pnpm --filter profile build`, `pnpm exec biome check .`, `pnpm check-types` (8/8 pass).
- Smoke Chromium thực tế ở `1440×900`, `768×1024`, `375×812`, `320×812`: không tràn ngang, phím `Tab` đi thẳng từ `#targetNote` sang `#submitLeadBtn`, nháp cũ có `examEnglish` không gây lỗi, gửi form với `?ketqua=` giữ đúng `placement` và cắt chuỗi dài về 300 ký tự.
- Playwright E2E `specs/profile-lead-intake.spec.ts`: 3/3 pass (`AC-001`, `AC-002`, `AC-003`).
- Tiếp theo: mở PR vào `develop`, chạy `ak-review-pr --fix --reply --advice`, merge và theo dõi CI `develop` xanh.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
