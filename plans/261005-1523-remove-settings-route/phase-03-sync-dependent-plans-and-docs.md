---
phase: 3
title: "Đồng bộ plan phụ thuộc, docs, verify"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Đồng bộ plan phụ thuộc, docs, verify

## Goal
Các plan đang mở không còn trỏ tới trang/module đã xoá; CHANGELOG ghi nhận việc gỡ; toàn bộ gate local xanh.

## Files to Create / Modify
- Modify: `plans/261005-0754-sepay-bank-hub-tuition-qr/plan.md` (:20, :38, :72), `phase-02-teacher-bank-linking.md` (:14, :26, :52, :88-89, :115), `phase-05-tuition-and-portal-ui.md` (:45), `phase-06-e2e-sandbox-and-docs.md` (:38) — thay "Cài đặt → tab Nhận học phí" / `settings.tsx` / `/settings?tab=payments` bằng **đề xuất** trang riêng `/payments` ("Nhận học phí": route `apps/web/src/routes/_auth/payments.tsx`, mục sidebar, entry `routes-matcher.ts` + `app-shell.tsx`). Đánh dấu `<!-- Updated: settings route removed 2026-10-05 -->`.
- Modify: `plans/261005-1234-teacher-grade-writing-speaking-submissions/phase-03-web-grading-ui.md:64` — `getApiBaseUrl()` lấy từ `./api-base-url`; `:168` precedent `validateSettingsSearch` không còn → trỏ sang precedent `validateSearch` khác còn tồn tại (kiểm tra file route thật, vd login/profile/schedule, trước khi ghi). `plan.md:160` cập nhật claim tương ứng.
- Modify: `CHANGELOG.md` — mục ngày merge, nhóm `### Removed`: "Gỡ trang Cài đặt (`/settings`) và API `/api/kernel/settings` — chưa tính năng nào dùng workspace settings; bảng DB giữ nguyên."
- GitHub: comment lên #320 tóm tắt thay đổi chỗ đặt UI (user duyệt nội dung trước khi đăng).

## Tasks & Steps
- [ ] 1. Sửa plan SePay + plan chấm bài như trên; grep `settings` trong 2 thư mục plan đó chỉ còn khớp ghi chú cập nhật.
- [ ] 2. Thêm mục CHANGELOG.
- [ ] 3. Chạy full gate local (PR vào `develop` không có CI): `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test`.
- [ ] 4. E2E: `grep -rln "settings" apps/e2e --include='*.ts'` — nếu có spec đụng `/settings` thì sửa; sau đó `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`.
- [ ] 5. Comment lên #320.

## Verification
- Tất cả lệnh ở bước 3–4 xanh.
- Grep `/settings`, `repos/settings`, `settings.tsx` trong `plans/261005-0754-*` và `plans/261005-1234-*` không còn chỉ dẫn thực thi trỏ tới code đã xoá.
