---
phase: 1
title: "Phản ánh trạng thái kết nối Zalo OA trên ReportsRoute và CreateReportModal"
status: completed
depends: []
files:
  - apps/web/src/routes/_auth/reports.tsx
  - apps/web/src/components/modals/create-report-modal.tsx
  - apps/web/src/routes/_auth/reports.test.tsx
---

# Phase 1: Phản ánh trạng thái kết nối Zalo OA trên ReportsRoute và CreateReportModal

## Context

Trên trang `/reports`, empty state đang hiển thị CTA / lead "Gửi qua Zalo OA" dù chưa có bất kỳ kênh Zalo OA nào được kết nối. Khi mở modal tạo báo cáo, tùy chọn kênh Zalo OA cũng không có ghi chú về trạng thái kết nối.

## Tasks

### 1. Cập nhật `apps/web/src/routes/_auth/reports.tsx`
- [x] Kiểm tra trạng thái kết nối kênh Zalo OA (hiện tại: `isZaloConnected = false` vì chưa có tích hợp Zalo OA).
- [x] Cập nhật `PageHead lead`:
  - Khi chưa kết nối kênh: không hiển thị claim "Gửi qua Zalo OA" sai lệch.
  - Hiển thị số lượng báo cáo: `reportCount > 0 ? \`${reportCount} báo cáo\` : "Chưa có báo cáo nào"`.
  - Hiển thị kèm Badge trạng thái kết nối: `<Badge variant="muted">Zalo OA: Chưa kết nối</Badge>`.
  - Khi đã kết nối kênh (nếu có cấu hình tương lai): hiển thị `Gửi qua Zalo OA · \${reportCount} báo cáo` hoặc `Gửi qua Zalo OA`.
- [x] Export `ReportsRoute` component để hỗ trợ unit testing.

### 2. Cập nhật `apps/web/src/components/modals/create-report-modal.tsx`
- [x] Trong dropdown "Gửi qua", cập nhật tùy chọn Zalo OA hiển thị rõ `Zalo OA (Chưa kết nối)` với value `"Zalo OA"` để người dùng nắm rõ khi tạo báo cáo.

### 3. Viết unit test `apps/web/src/routes/_auth/reports.test.tsx`
- [x] Kiểm thử trạng thái empty (`reports: []`):
  - Kiểm tra tiêu đề "Báo cáo phụ huynh"
  - Kiểm tra lead chứa "Chưa có báo cáo nào" và badge "Zalo OA: Chưa kết nối"
  - Kiểm tra KHÔNG hiển thị chuỗi đơn độc "Gửi qua Zalo OA"
  - Kiểm tra thông báo rỗng "Chưa có báo cáo nào được gửi." và "Chưa có nhật ký gửi tin nhắn."
- [x] Kiểm thử trạng thái populated (`reports: [...]`):
  - Kiểm tra lead chứa `2 báo cáo` và badge trạng thái
  - Kiểm tra bảng danh sách báo cáo với tên học viên, trạng thái
  - Kiểm tra danh sách nhật ký gửi tin
- [x] Kiểm thử CreateReportModal render tùy chọn `Zalo OA (Chưa kết nối)`

### 4. Verification
- [x] Chạy `pnpm vitest run src/routes/_auth/reports.test.tsx` trong `apps/web`
- [x] Chạy `pnpm test`
- [x] Chạy `pnpm check`
- [x] Chạy `pnpm check-types`
