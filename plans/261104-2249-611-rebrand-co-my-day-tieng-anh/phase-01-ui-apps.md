---
phase: 1
title: "UI web, admin, student"
status: pending
dependencies: []
---

# Phase 1: UI web, admin, student

## Context

Tên hiển thị trong 3 app React và `index.html` của từng app. `packages/ui` nhận tên qua `brandLabel`, nên không cần sửa package này.

## Files được sửa

- `apps/web/index.html`, `apps/web/src/routes/__root.tsx`, `apps/web/src/components/auth/auth-shell.tsx`, `apps/web/src/routes/login.tsx`, `apps/web/src/routes/verify-email.tsx`
- `apps/web/src/routes/_auth/reports.tsx` (chỉ comment, thay bằng tên trung tính "ứng dụng")
- `apps/admin/index.html`, `apps/admin/src/routes/__root.tsx`, `apps/admin/src/routes/login.tsx`, `apps/admin/src/components/layout/admin-shell.tsx`, `apps/admin/src/components/auth/admin-auth-shell.tsx`
- `apps/student/index.html`, `apps/student/src/routes/__root.tsx`, `apps/student/src/components/auth/auth-shell.tsx`
- `apps/web/src/components/modals/bank-hub-link-modal.tsx:157` (`TeacherOS không lưu mật…`), `apps/web/src/routes-matcher.ts` (chỉ comment)
- Test/e2e khóa chuỗi: `apps/web/src/routes/login-signup-gate.test.tsx`, `apps/web/src/components/not-found.test.tsx`, `apps/e2e/specs/admin-auth.spec.ts`, `apps/e2e/specs/404-branded-status.spec.ts`

## Bước

1. Liệt kê lại: `grep -rnE "Teacher ?OS" apps/web apps/admin apps/student -I --exclude-dir=node_modules`.
2. Thay tên trong các file trên, giữ nguyên hậu tố (`· Quản trị`, `· Học viên`). Với `login.tsx` câu "New to Teacher OS?" đổi thành "New to Cô Mỹ Dạy Tiếng Anh?"; nếu câu đọc gượng, viết lại cho tự nhiên nhưng giữ ý.
3. `apps/web/src/routes/__root.tsx`: cập nhật `title` và `description` meta (mô tả "quản lý lớp gia sư 1:1" giữ nguyên).
4. Cập nhật 4 file test/e2e ở trên cho khớp chuỗi mới.
5. Kiểm sidebar/auth shell với tên dài: nếu tràn, thêm `truncate` + `title` ở phần tử tên, không đổi tên.

## Kiểm chứng

- `pnpm --filter web test`, `pnpm --filter admin test`, `pnpm --filter student test`: xanh.
- `pnpm check-types` và `pnpm exec biome check .`: xanh.
- `pnpm --filter e2e e2e` chỉ spec `admin-auth` và `404-branded-status` với `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`: xanh.
- Chụp login và dashboard của 3 app ở 1440×900, 768×1024, 375×812; tên không tràn, focus bằng bàn phím vẫn thấy rõ (theo `REVIEW.md`).

## Rủi ro và lui

Tên dài vỡ layout: sửa CSS cục bộ. Lui bằng revert commit; không có thay đổi dữ liệu.
