---
phase: 5
title: "Màn [5] Nhật ký gửi thông báo (apps/web)"
status: completed
priority: P0
effort: "5h"
dependencies: ["phase-02"]
---

# Phase 5: Màn Nhật ký thông báo `[5]`

## Files

- Create: `apps/server/src/routes/notification-logs.ts` gắn `kernel.route("/notification-logs", ...)` trong `kernel.ts`.
  - `GET /` với `notificationLogQuerySchema`: org-scoped, join `student` lấy tên; `q` tìm trên tên học viên / `recipient_email` / `title` (lower LIKE, escape `%_`); `event` lọc `event_group`; `status` lọc `status`; sắp `created_at desc, id desc`; 20 dòng/trang; `counts` theo trạng thái tính trên bộ lọc q + event (không áp status) để chip hiển thị số.
- Create: `apps/web/src/routes/_auth/notifications/index.tsx` — PageHead "Nhật ký gửi thông báo (Email & In-app)"; search debounce 300ms → `?q`; chip nhóm sự kiện (Tất cả, Mời vào lớp, Giao bài / Trả điểm, Học phí, Đổi lịch / Nghỉ lễ) → `?event`; chip trạng thái (Tất cả, Đang chờ, Đã gửi, Đã xem, Lỗi gửi) với badge đếm `aria-hidden` → `?status`; bảng Thời gian / Người nhận (tên + email) / Sự kiện / Kênh / Trạng thái / Thao tác; phân trang `?page`. Trạng thái loading / rỗng / lỗi theo mẫu `/assignments`.
- Create: `apps/web/src/components/notifications/notification-detail-dialog.tsx` — (eye) mở nội dung thư (tiêu đề, nội dung, Reply-To, tên người gửi), `sent_at`, `read_at`, `retry_count`, `last_error` nếu có.
- Modify: `apps/web/src/components/layout/sidebar.tsx` — mục "Nhật ký thông báo"; thêm vào search ⌘K nếu trang có danh mục điều hướng.
- Modify: `apps/web/src/lib/...` repo/query hook theo mẫu trang list hiện có.
- Test: `apps/server/src/routes/notification-logs.test.ts`, `apps/web/src/routes/_auth/notifications/index.test.tsx`.

## Steps

1. Test đỏ server: org khác không thấy; lọc event/status/q đúng; trang 2; `counts` đúng; `q` có `%` không thành wildcard.
2. Test đỏ web: filter đồng bộ URL hai chiều, debounce, chip đếm, mở dialog chi tiết, phân trang.
3. Viết code; verify 3 viewport (375: bảng chuyển dạng thẻ hoặc cuộn ngang trong container, không cuộn trang) + focus bàn phím; chụp screenshot cho PR, chạy `pnpm design:compare`.

## Verification

- `pnpm --filter server test -- notification-logs`
- `pnpm --filter web test -- notifications`
- `pnpm check`, `pnpm check-types`
