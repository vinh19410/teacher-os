---
type: reverse-sources
feature: auth-signin
updated: 2026-11-11
---

# auth-signin — Danh mục nguồn reverse

Quy ước: đường dẫn tính từ gốc repo `/root/projects/teacher-os/`. "Mã hóa" = cách đọc chứng cứ.

| # | Nguồn (nhóm file) | Nội dung khai thác | Confidence | Encoding |
|---|---|---|---|---|
| S1 | `packages/auth/src/index.ts` + `packages/auth/src/index.ts` các `*.test.ts` cùng thư mục (auth-reset-password, auth-verify-email-role, auth-email-otp, auth-teacher-signup, auth-admin-signup, auth-verification-email) | Cấu hình Better-Auth, thông điệp chặn vai, allowlist, OTP, hook gán vai, thư | Cao | Nguyên văn + test |
| S2 | `packages/auth/src/role.ts` + `packages/auth/src/role.test.ts` | Phân loại cổng theo origin, mặc định học viên | Cao | Nguyên văn + test |
| S3 | `packages/auth/src/topology.ts` + `packages/auth/src/topology.test.ts` | Đường mount auth, ràng buộc cookie | Cao | Nguyên văn + test |
| S4 | `packages/auth/src/avatar-policy.ts` | Kiểm tên (2-100), ảnh đại diện an toàn | Cao | Nguyên văn |
| S5 | `packages/auth/src/mail/` (brand, mailer, 3 template) | Thương hiệu thư, subjects, hạn hiệu lực in trong thư, retry Resend | Cao | Nguyên văn |
| S6 | `packages/db/src/schema/auth.ts`, `packages/db/src/schema/membership.ts` | Bảng user/session/account/verification/membership | Cao | Schema DDL |
| S7 | `packages/api/src/contracts.ts:1975-1998` | Catalog mã lỗi chặn vai + lý do thiết kế | Cao | Nguyên văn + comment |
| S8 | `apps/server/src/app.ts` | Mount auth, bootstrapMiddleware 3 cổng, HSTS/CORS, tạo tổ chức | Cao | Nguyên văn + comment |
| S9 | `apps/server/src/session.ts`, `apps/server/src/role-gates.test.ts` | Đọc session user, 3 tầng gate bằng test | Cao | Nguyên văn + test |
| S10 | `apps/server/src/routes/student.ts:497-545` | Guard cổng học viên | Cao | Nguyên văn |
| S11 | `apps/server/src/lib/require-admin.ts` + test | Gate quản trị, kiểm lại mỗi request | Cao | Nguyên văn + test |
| S12 | `packages/infra/alchemy.run.ts`, `packages/infra/src/topology.ts` | Tên binding môi trường, fail-closed prod | Cao | Cấu hình |
| S13 | `apps/web/src/routes/` (login, _auth/route, forgot-password, reset-password, verify-email, index) | Route bảo vệ, tham số URL, điều hướng | Cao | Nguyên văn |
| S14 | `apps/web/src/components/` (sign-in-form, sign-up-form, google-oauth-button, account-blocked-view, verify-email-view, auth/*) | Copy UI nguyên văn, 2 tầng kiểm tra lỗi | Cao | Nguyên văn |
| S15 | `apps/web/src/lib/` (auth-client, kernel-load-state, reauth, role-block, query-client, data-provider, features, sign-in-schema, sign-up-schema, repos/kernel.ts) | Cache phiên, validate returnUrl, mất phiên, bị chặn vai, cờ tính năng | Cao | Nguyên văn |
| S16 | `apps/e2e/specs/` (signin-validation, auth-fail-loudly, account-role-separation, admin-auth, web-email-verification, signup-ui-smoke, login.smoke) + component test `apps/web/src/routes/login-signup-gate.test.tsx:45-78` + `apps/e2e/playwright.config.ts:96` | Câu chữ UI nguyên văn, chặn không tạo phiên, cờ e2e | Cao | Test E2E |
| S17 | `docs/project-overview-pdr.md:14,21,22`, `docs/_reverse/reverse-plan.json:9` | Quyết định vai/403, biên Better-Auth, cờ build; kế hoạch reverse | Trung bình | Tài liệu quyết định |

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
