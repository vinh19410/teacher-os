# auth-student-signup — Danh mục nguồn (provenance)

| ID | Nguồn (file/folder) | Loại | Ngày (nếu biết) | Confidence | Encoding OK? | Phần feature suy ra từ đây |
|----|---------------------|------|-----------------|------------|--------------|----------------------------|
| S1 | docs/project-overview-pdr.md (dòng 14, 23, 44-49) | md | — | high | OK | Scope, actors, purpose, Conflict C1 |
| S2 | README.md (dòng 56-57) | md | — | high | OK | Mô tả app, Conflict C2 |
| S3 | packages/db/src/schema/student.ts | ts (schema) | — | high | OK | Entity STUDENT, unique index, onboarding fields |
| S4 | packages/auth/src/index.ts | ts | — | high | OK | F1/F2/F5/F6, role hooks, OTP, emailVerification |
| S5 | apps/server/src/student-provisioning.ts (+ .test.ts) | ts | — | high | OK | F3 provisioning D1/D2/D3/D7 |
| S6 | apps/server/src/app.ts | ts | — | high | OK | Gate student↔teacher app |
| S7 | apps/server/src/routes/student.ts | ts | — | high | OK | Guard portal, orgs, invitations, onboarding, CSRF |
| S8 | packages/api/src/contracts.ts (1967-2075, 2913-2921) | ts | — | high | OK | Error codes, onboarding schema, invitation codes |
| S9 | packages/auth/src/role.ts (+ role.test.ts) | ts | — | high | OK | resolveRequestApp, default student |
| S10 | packages/auth/src/mail/* (verification/otp/reset templates, brand.ts) | ts | — | high | OK | Wording mail, thời hạn |
| S11 | apps/student/src/routes/login.tsx, verify-email.tsx, _auth/onboarding.tsx; apps/student/src/components/auth/*, components/onboarding/*, components/overview/student-error-view.tsx | tsx | — | high | OK | Toàn bộ UI + wording lỗi tiếng Việt |
| S12 | apps/student/src/lib/auth-schemas.ts, lib/auth-client.ts | ts | — | high | OK | Validate client |
| S13 | packages/auth/src/auth-email-otp.test.ts | test | — | high | OK | OTP, chống hijack |
| S14 | packages/auth/src/auth-verification-email.test.ts, auth-verify-email-role.test.ts (77-113) | test | — | high | OK | F1, ROLE_MISMATCH redirect |
| S15 | packages/auth/src/auth-reset-password.test.ts | test | — | high | OK | F6 |
| S16 | packages/auth/src/auth-teacher-signup.test.ts, auth-admin-signup.test.ts | test | — | high | OK | FR-015/016 |
| S17 | apps/server/src/routes/student-auth-otp.test.ts (100-199) | test | — | high | OK | OTP A/B/C, teacher pre-create (C1 evidence) |
| S18 | apps/server/src/role-gates.test.ts (190-283) | test | — | high | OK | Gate role session |
| S19 | apps/server/src/student-provisioning.test.ts (6 case) | test | — | high | OK | F3 |
| S20 | apps/e2e/specs/student-portal-email-verification.spec.ts (30-133) | e2e | — | high | OK | F1 end-to-end |
| S21 | apps/e2e/specs/student-portal-provisioning.spec.ts (11-36) | e2e | — | high | OK | F3 end-to-end |
| S22 | apps/e2e/specs/student-portal-onboarding.spec.ts (309+, 464+) | e2e | — | high | OK | Onboarding |
| S23 | apps/e2e/specs/signup-ui-smoke.spec.ts, signin-validation.spec.ts | e2e | — | high | OK | UI smoke, validate form |
| S24 | apps/e2e/specs/account-role-separation.spec.ts (63-157) | e2e | — | high | OK | F4 |
| S25 | apps/server/src/routes/kernel.ts (463-530) | ts | — | high | OK | Conflict C1 (POST /api/students) |
| S26 | apps/server/src/index.ts (75, 165-166) | ts | — | high | OK | STUDENT_ORIGINS binding, studentOrigin (phần tử đầu) |
| S27 | docs/_reverse/reverse-plan.json | json | — | medium | OK | Feature đăng ký, existing_doc: null |

## Ghi chú nguồn

- **Confidence mỗi nguồn:** high = code/test chạy được, đọc trực tiếp · medium = file cấu hình/meta.
- **Encoding ⚠:** không phát hiện mojibake; toàn bộ wording tiếng Việt lấy nguyên văn từ code.
- **Nguồn mâu thuẫn / lỗi thời:** PDR (S1) vs kernel.ts (S25) về tạo hồ sơ thủ công → ghi cả 2, 🟡 + OQ-6, không tự chọn bên. README (S2) không nêu OTP mặc định → Conflict C2.
