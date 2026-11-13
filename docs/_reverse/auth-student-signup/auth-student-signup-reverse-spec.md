---
type: reverse-srs
feature: auth-student-signup
status: draft
updated: 2026-11-11
confidence_summary: "✅226 🔵16 🟡21"
links: reverse-sources.md, reverse-gaps.md, _evidence.md, srs/auth-student-signup-reverse-flows.md, srs/auth-student-signup-reverse-states.md, srs/auth-student-signup-reverse-erd.md, usecases/auth-student-signup-reverse-usecase-index.md
---

# auth-student-signup — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [reverse-sources.md](./reverse-sources.md) (S1–S27: code 3 apps + 3 packages, test unit/E2E, docs PDR/README).
- **Câu hỏi mở / khác biệt:** xem [reverse-gaps.md](./reverse-gaps.md) (12 OQ, 8 Gap, 2 Conflict, 5 Inferred).
- **Evidence chi tiết:** xem [_evidence.md](./_evidence.md).

### 0.3 Khác biệt với tài liệu chính

| Điểm | Reverse nói (từ nguồn) | Doc chính nói (`docs/project-overview-pdr.md`, `README.md`) | Đề xuất |
|------|------------------------|-----------------------------------|---------|
| Tạo hồ sơ học viên thủ công | Route `POST /api/students` vẫn tồn tại và tạo hồ sơ (apps/server/src/routes/kernel.ts:463-530); test teacher pre-create hồ sơ (apps/server/src/routes/student-auth-otp.test.ts:100) | "Giáo viên không còn tự tạo hồ sơ học viên" (docs/project-overview-pdr.md:23) | OQ-6 — `/cr` |
| Phương thức đăng nhập | Tab OTP email là tab MẶC ĐỊNH ở cổng học viên (apps/student/src/routes/login.tsx:32-42) | README.md:56-57 chỉ nêu email/mật khẩu + Google, không nêu OTP | OQ — cập nhật README |
| Mục đích provisioning | Lần đầu vào portal tự tạo hồ sơ trong org sớm nhất TOÀN CỤC (apps/server/src/student-provisioning.ts:53-64) | docs/project-overview-pdr.md:23 nêu rõ "earliest global org" nhưng không giải thích vì sao org sớm nhất là đích đúng; 44-49 chỉ mô tả multi-org/lời mời | OQ-5 (thu hẹp: lý do nghiệp vụ) |

## 1. Scope

Học viên tự đăng ký và truy cập cổng học viên của trung tâm "Cô Mỹ Dạy Tiếng Anh": (1) đăng ký tài khoản bằng email + mật khẩu, hệ thống gửi email xác thực trong 1 giờ, bấm link xong tự đăng nhập (packages/auth/src/index.ts:298-326); (2) đăng nhập bằng email/mật khẩu, mã OTP email 6 số (tab mặc định), hoặc Google OAuth; (3) lần đầu vào cổng học viên, hệ thống TỰ tạo hồ sơ học viên trong tổ chức sớm nhất toàn cục nếu email chưa có hồ sơ và không có lời mời đang chờ (apps/server/src/student-provisioning.ts:27-83); (4) hoàn thành onboarding 5 bước mục tiêu học tập; (5) phân vai tự động theo origin đăng ký — cổng học viên mặc định student, giáo viên/quản trị bị chặn chéo. ✅ [S4][S5][S8]

**Boundary (out of scope):**
- Tạo hồ sơ học viên thủ công bởi giáo viên (route cũ vẫn tồn tại — Conflict C1, OQ-6). 🟡
- Gửi/nhận lời mời vào lớp (STUDENT_INVITATION flow) — chỉ chạm ở điểm "pending invitation chặn auto-provision" và "accept lời mời". ✅ [S8]
- Quản trị org, portal giáo viên, portal admin. ✅ [S2]
- Đổi email (các endpoint OTP change-email bị chặn — packages/auth/src/index.ts:366-379). ✅ [S4]

## 2. Actors & Stakeholders

| Actor | Loại | Mục tiêu | Trong scope? | Nguồn | Nhãn |
|-------|------|----------|--------------|-------|------|
| Học viên (đã/không có tài khoản) | người | Tự đăng ký, xác thực email, vào cổng, khai mục tiêu học tập | Có | S8, S11 | ✅ |
| Khách chưa đăng nhập | người | Đăng nhập OTP/mật khẩu/Google tại apps/student/src/routes/login.tsx | Có | S11 | ✅ |
| Giáo viên | người | Bị chặn khỏi cổng học viên, tiếp tục dùng cổng giáo viên | Có (điểm chặn) | S6, S7 | ✅ |
| Quản trị viên | người | Bị chặn khỏi cổng học viên (chỉ dùng cổng admin) | Không (ngoài scope, chỉ gate) | S6 | ✅ |
| Mailer (hệ thống gửi mail) | hệ thống | Gửi mail xác thực/OTP/đặt lại mật khẩu; lỗi có fallback log-only | Có (phụ thuộc) | S4 | ✅ |
| Google OAuth | ngoài | Cung cấp đăng nhập xã hội | Có (phụ thuộc) | S4 | ✅ |

## 3. Functional Requirements (FR)

| ID | Title | Description | Priority | Verify by | Nguồn | Nhãn |
|----|-------|-------------|----------|-----------|-------|------|
| FR-auth-student-signup-001 | Đăng ký email + mật khẩu | Tab "Đăng ký" trên trang login cổng học viên | P0 | demo | S11 | ✅ |
| FR-auth-student-signup-002 | Validate form đăng ký client | Tên ≥2 ký tự, email hợp lệ, mật khẩu ≥8 | P0 | demo | apps/student/src/lib/auth-schemas.ts:3-7,14-18 | ✅ |
| FR-auth-student-signup-003 | Gửi email xác thực ngay khi đăng ký | sendOnSignUp=true, lỗi gửi không chặn đăng ký | P0 | test | packages/auth/src/index.ts:298-326 | ✅ |
| FR-auth-student-signup-004 | Link xác thực hiệu lực 1 giờ | expiresIn 60*60 giây | P0 | test | packages/auth/src/index.ts:325 | ✅ |
| FR-auth-student-signup-005 | Xác thực xong tự đăng nhập | autoSignInAfterVerification=true, về trang verify-email?verified=ok | P0 | test | packages/auth/src/index.ts:324; apps/student/src/components/auth/verify-email-view.tsx:25 | ✅ |
| FR-auth-student-signup-006 | Gửi lại link xác thực | POST /send-verification-email; lỗi gửi bị ném ra client | P1 | test | packages/auth/src/index.ts:299-322 | ✅ |
| FR-auth-student-signup-007 | Đăng nhập email + mật khẩu | Tab "Đăng nhập" | P0 | demo | S11 | ✅ |
| FR-auth-student-signup-008 | Đăng nhập OTP email (tab mặc định) | Gửi mã qua email rồi nhập mã để đăng nhập | P0 | test | apps/student/src/routes/login.tsx:32-42 | ✅ |
| FR-auth-student-signup-009 | OTP 6 số, hiệu lực 5 phút | expiresIn 300, lưu băm (hashed) | P0 | test | packages/auth/src/index.ts:564-596 | ✅ |
| FR-auth-student-signup-010 | Cooldown gửi OTP 60 giây | Chống spam gửi lại mã | P1 | test | packages/auth/src/index.ts:380-424 | ✅ |
| FR-auth-student-signup-011 | OTP login xác thực luôn email | Đặt emailVerified=true, xóa account credential chưa verify (chống chiếm tài khoản) | P0 | test | packages/auth/src/auth-email-otp.test.ts:268-317 | ✅ |
| FR-auth-student-signup-012 | Chặn OTP cho giáo viên + endpoint nhạy cảm | Teacher không nhận OTP; các path email-otp đổi email/đặt lại mk bị chặn | P0 | test | packages/auth/src/index.ts:366-424 | ✅ |
| FR-auth-student-signup-013 | Đăng nhập Google lần đầu | Nút Google trên trang login, lỗi quay lại /login | P0 | demo | apps/student/src/components/auth/google-oauth-button.tsx:48 | ✅ |
| FR-auth-student-signup-014 | Phân vai theo origin đăng ký | user.role gán MỘT lần lúc tạo user theo origin yêu cầu; mặc định student | P0 | test | packages/auth/src/index.ts:436-498; packages/auth/src/role.ts:60 | ✅ |
| FR-auth-student-signup-015 | Chặn đăng ký teacher ngoài allowlist | Email phải nằm trong TEACHER_EMAILS | P0 | test | packages/auth/src/index.ts:436-498 | ✅ |
| FR-auth-student-signup-016 | Chặn đăng ký admin ngoài allowlist | Email phải nằm trong ADMIN_EMAILS | P0 | test | packages/auth/src/index.ts:436-498 | ✅ |
| FR-auth-student-signup-017 | Gate role giữa session và app | 403 + mã ROLE_MISMATCH khi role không khớp app đang truy cập | P0 | test | packages/auth/src/index.ts:501-538 | ✅ |
| FR-auth-student-signup-018 | Verify-email trễ chuyển hướng báo lỗi | Redirect callbackURL + ?error=ROLE_MISMATCH thay vì 403 JSON | P1 | test | packages/auth/src/index.ts:524-533 | ✅ |
| FR-auth-student-signup-019 | Tự tạo hồ sơ lần đầu vào portal | Auto-provision khi email chưa có hồ sơ | P0 | test | apps/server/src/routes/student.ts:148-164 | ✅ |
| FR-auth-student-signup-020 | Provision vào org sớm nhất toàn cục | org createdAt ASC, id ASC, limit 1 | P0 | test | apps/server/src/student-provisioning.ts:53-64 | ✅ |
| FR-auth-student-signup-021 | Bỏ provision khi có lời mời pending | Học viên tự accept lời mời thay vì auto-join | P0 | test | apps/server/src/student-provisioning.ts:37-51 | ✅ |
| FR-auth-student-signup-022 | Provision fail-open | Lỗi CSDL chỉ ghi log, không chặn vào portal | P0 | test | apps/server/src/student-provisioning.ts:77-83 | ✅ |
| FR-auth-student-signup-023 | Bắt buộc email verified để dùng portal API | 403 STUDENT_EMAIL_UNVERIFIED | P0 | test | apps/server/src/routes/student.ts:130-138,529-536 | ✅ |
| FR-auth-student-signup-024 | Chọn org khi có nhiều org | Header x-student-org-id hoặc ?org=; GET /orgs liệt kê | P1 | demo | apps/server/src/routes/student.ts:177-208,676-713 | ✅ |
| FR-auth-student-signup-025 | Onboarding 5 bước bắt buộc | examInterest, currentLevel, targetScore, learningGoals, dailyStudyHours (+note, entryScore tùy chọn) | P0 | test | apps/student/src/components/onboarding/onboarding-wizard.tsx:57-128 | ✅ |
| FR-auth-student-signup-026 | Chính sách mật khẩu phía server | Chỉ thấy ràng buộc ≥8 ở client; server chưa thấy cấu hình | P1 | phân tích | packages/auth/src/index.ts (không thấy minPassword) | 🟡 |
| FR-auth-student-signup-027 | Thời gian sống phiên đăng nhập | Không thấy cấu hình TTL trong repo | P2 | phân tích | packages/auth/src/index.ts (không thấy session expiresIn) | 🟡 |

## 4. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Priority | Acceptance | Nguồn | Nhãn |
|----|----------|-------------|----------|------------|-------|------|
| NFR-auth-student-signup-001 | security | OTP lưu dạng băm, không lưu plaintext | P0 | kiểm tra DB | packages/auth/src/index.ts:564-596 | ✅ |
| NFR-auth-student-signup-002 | security | Cookie SameSite=None + CSRF kiểm tra Origin cho mutation portal (4 nhóm: onboarding, enrollments, invitations, inbox) | P0 | test | apps/server/src/routes/student.ts:433-498 | ✅ |
| NFR-auth-student-signup-003 | security | Token đặt lại mật khẩu hết hạn 1 giờ + thu hồi phiên khi đổi mk | P0 | test | packages/auth/src/index.ts (resetPasswordTokenExpiresIn 3600, revokeSessionsOnPasswordReset) | ✅ |
| NFR-auth-student-signup-004 | data-quality | So khớp danh tính bằng lower(trim(email)) | P0 | test | apps/server/src/student-provisioning.ts:27-35 | ✅ |
| NFR-auth-student-signup-005 | usability | Ghi nhớ tab login cuối (localStorage TAB_STORAGE_KEY) | P2 | demo | apps/student/src/routes/login.tsx:32-42 | ✅ |
| NFR-auth-student-signup-006 | usability | Thông điệp lỗi tiếng Việt, có hướng xử lý | P1 | demo | apps/student/src/components/auth/otp-sign-in-form.tsx:129-158 | ✅ |
| NFR-auth-student-signup-007 | reliability | Gửi mail chạy nền (runInBackground/waitUntil) | P1 | demo | packages/auth/src/index.ts:88 (runInBackground) | ✅ |
| NFR-auth-student-signup-008 | reliability | Cờ staging AUTH_ASSUME_EMAIL_VERIFIED bỏ qua bước xác thực; infra chặn bật trên prod (throw khi appDomain = prod) | P2 | demo | apps/server/src/index.ts:106; packages/infra/src/topology.ts:140-149; apps/server/src/session.ts:20 | ✅ |
| NFR-auth-student-signup-009 | performance | Thời gian phản hồi portal khi auto-provision chấp nhận được | P2 | phân tích | (không đo trong code) | 🔵 |
| NFR-auth-student-signup-010 | accessibility | Form có label, focus ring theo design system | P2 | demo | apps/student/src/components/auth/*.tsx (class focus-visible) | 🔵 |

## 5. Business Rules

| ID | Rule | Trigger | Implements FR | Nguồn | Nhãn |
|----|------|---------|---------------|-------|------|
| BR-auth-student-signup-001 | Role gán MỘT lần lúc tạo user, theo origin yêu cầu | user.create.before | FR-014 | packages/auth/src/index.ts:436-498 | ✅ |
| BR-auth-student-signup-002 | Client không tự khai role (additionalFields input:false) | mọi request auth | FR-014 | packages/auth/src/index.ts (user.additionalFields) | ✅ |
| BR-auth-student-signup-003 | Origin không khớp STUDENT_ORIGINS/teacher/admin → mặc định student (đặc quyền tối thiểu, theo quyết định plan #260 D3) | resolveRequestApp | FR-014 | packages/auth/src/role.ts:60 | ✅ |
| BR-auth-student-signup-004 | Origin "null"/rỗng bị từ chối, không đoán app | origin header thiếu | FR-014 | packages/auth/src/role.ts | ✅ |
| BR-auth-student-signup-005 | Danh tính học viên = email (đã lower+trim), không phải user id | mọi so khớp hồ sơ | FR-019 | apps/server/src/student-provisioning.ts:27-35 | ✅ |
| BR-auth-student-signup-006 | UNIQUE(org_id, lower(trim(email))) với trim(email) != '' | tạo hồ sơ | FR-019 | packages/db/src/schema/student.ts:67-69 (migration 0025) | ✅ |
| BR-auth-student-signup-007 | user.email unique toàn cục | đăng ký | FR-001 | packages/auth/src/index.ts (better-auth) | ✅ |
| BR-auth-student-signup-008 | Chỉ provision khi 0 hồ sơ trùng email | vào portal lần đầu | FR-019 | apps/server/src/student-provisioning.ts:27-35 | ✅ |
| BR-auth-student-signup-009 | Có lời mời pending → KHÔNG auto-provision | vào portal khi có invite | FR-021 | apps/server/src/student-provisioning.ts:37-51 | ✅ |
| BR-auth-student-signup-010 | Org nhận hồ sơ mới = org sớm nhất TOÀN CỤC (createdAt ASC, id ASC), không theo miền email/domain | provision | FR-020 | apps/server/src/student-provisioning.ts:53-64 | ✅ |
| BR-auth-student-signup-011 | Lỗi provision không chặn truy cập (fail-open, chỉ log) | lỗi CSDL lúc provision | FR-022 | apps/server/src/student-provisioning.ts:77-83 | ✅ |
| BR-auth-student-signup-012 | Hồ sơ mới: tên lấy từ tài khoản, phone/zalo/parentName/parentPhone rỗng | provision | FR-019 | apps/server/src/student-provisioning.ts:67-76 | ✅ |
| BR-auth-student-signup-013 | API portal chỉ phục vụ session role = student | mọi /api/student/* | FR-017 | apps/server/src/routes/student.ts:500-512 | ✅ |
| BR-auth-student-signup-014 | API portal bắt buộc emailVerified | mọi /api/student/* | FR-023 | apps/server/src/routes/student.ts:529-536 | ✅ |
| BR-auth-student-signup-015 | Teacher app chặn student session (ACCOUNT_STUDENT_ROLE) | student chạm /api teacher | FR-017 | apps/server/src/app.ts:224-232 | ✅ |
| BR-auth-student-signup-016 | Nội dung chính chỉ mở sau khi onboarding hoàn tất (onboardingCompletedAt) | vào portal | FR-025 | apps/student/src/routes/_auth/index.tsx:77; apps/student/src/components/layout/student-page-gate.tsx:42 | ✅ |
| BR-auth-student-signup-017 | Mật khẩu tối thiểu 8 ký tự — chỉ khẳng định ở client | đăng ký/đổi mk | FR-002 | apps/student/src/lib/auth-schemas.ts:9 | 🟡 |
| BR-auth-student-signup-018 | Đặt lại mật khẩu: token hết hạn 1 giờ, thu hồi mọi phiên | reset password | FR-003 | packages/auth/src/index.ts | ✅ |

## 6. Error Matrix

| Error ID | Title | Trigger | Severity | Related FR | Screen state | Recovery | Nguồn | Nhãn |
|----------|-------|---------|----------|------------|--------------|----------|-------|------|
| E-auth-student-signup-001 | Tên quá ngắn | name < 2 ký tự | minor | FR-002 | form đăng ký | nhập lại | apps/student/src/lib/auth-schemas.ts:6 | ✅ |
| E-auth-student-signup-002 | Thiếu email | email rỗng | minor | FR-002 | form | nhập lại | apps/student/src/lib/auth-schemas.ts:3 | ✅ |
| E-auth-student-signup-003 | Email sai định dạng | regex fail | minor | FR-002 | form | nhập lại | apps/student/src/lib/auth-schemas.ts:4 | ✅ |
| E-auth-student-signup-004 | Thiếu mật khẩu | password rỗng | minor | FR-002 | form | nhập lại | apps/student/src/lib/auth-schemas.ts:5 | ✅ |
| E-auth-student-signup-005 | Mật khẩu quá ngắn | < 8 ký tự | minor | FR-002 | form | nhập lại | apps/student/src/lib/auth-schemas.ts:7 | ✅ |
| E-auth-student-signup-006 | Mật khẩu bị server từ chối | chính sách server (chưa rõ) | minor | FR-026 | form | nhập lại | (không thấy config — OQ-1) | 🟡 |
| E-auth-student-signup-007 | Teacher dùng OTP portal HV | teacher request OTP | major | FR-012 | toast OTP | dùng portal GV | apps/student/src/components/auth/otp-sign-in-form.tsx:133-135 | ✅ |
| E-auth-student-signup-008 | Nhập sai OTP quá nhiều lần | quá giới hạn thử | major | FR-008 | toast OTP | gửi mã mới | apps/student/src/components/auth/otp-sign-in-form.tsx:139-141 | ✅ |
| E-auth-student-signup-009 | OTP sai/hết hạn | mã không khớp | major | FR-008/009 | toast OTP | gửi lại mã | apps/student/src/components/auth/otp-sign-in-form.tsx:146-152 | ✅ |
| E-auth-student-signup-010 | Endpoint OTP bị khóa | path email-otp đổi email/reset | minor | FR-012 | (API) | dùng đường chính thức | packages/auth/src/index.ts:374-377 | ✅ |
| E-auth-student-signup-011 | Student vào app teacher | role mismatch app GV | major | FR-017 | form đăng nhập | dùng cổng HV | packages/auth/src/index.ts:92-94 | ✅ |
| E-auth-student-signup-012 | Teacher vào portal HV (form) | role mismatch portal | major | FR-017 | form đăng nhập | dùng cổng GV | packages/auth/src/index.ts:96-97 | ✅ |
| E-auth-student-signup-013 | Role lạ vào cổng admin | admin gate | major | FR-017 | form admin | liên hệ quản trị | packages/auth/src/index.ts:98-99 | ✅ |
| E-auth-student-signup-014 | Verify email trễ bị gate chặn | ROLE_MISMATCH lúc auto-signin sau verify | major | FR-018 | redirect /login?error=ROLE_MISMATCH | đăng nhập đúng cổng | packages/auth/src/index.ts:524-533 | ✅ |
| E-auth-student-signup-015 | Google login thất bại | OAuth lỗi / error khác ROLE_MISMATCH | major | FR-013 | toast login | thử lại | apps/student/src/routes/login.tsx:59-63 | ✅ |
| E-auth-student-signup-016 | Teacher vào portal HV (API) | 403 ACCOUNT_TEACHER_ROLE | critical | FR-017 | màn lỗi portal | nút sang cổng GV | apps/server/src/routes/student.ts:511-512; apps/student/src/components/overview/student-error-view.tsx:98-103 | ✅ |
| E-auth-student-signup-017 | Chưa có hồ sơ liên kết | email không khớp hồ sơ nào sau provision | major | FR-019 | màn lỗi portal | chờ lời mời, nhận chuông | apps/server/src/routes/student.ts:166-174; student-error-view.tsx:104-107 | ✅ |
| E-auth-student-signup-018 | Email chưa xác thực | emailVerified=false | major | FR-023 | màn lỗi portal + nút gửi lại | bấm link trong mail | apps/server/src/routes/student.ts:130-138; student-error-view.tsx:108-113 | ✅ |
| E-auth-student-signup-019 | Nhiều hồ sơ trùng email | AMBIGUOUS | critical | FR-019 | màn lỗi portal | liên hệ trung tâm | apps/student/src/components/overview/student-error-view.tsx:114-118 | ✅ |
| E-auth-student-signup-020 | Lỗi portal không rõ | mã lỗi khác | minor | FR-023 | màn lỗi mặc định | thử lại sau | apps/student/src/components/overview/student-error-view.tsx:82-84 | ✅ |
| E-auth-student-signup-021 | Student chạm API teacher | 403 ACCOUNT_STUDENT_ROLE | major | FR-017 | (app GV) | về cổng HV | apps/server/src/app.ts:227-228 | ✅ |
| E-auth-student-signup-022 | Lời mời không còn hiệu lực | không tìm thấy invite pending | minor | FR-021 | accept lời mời | liên hệ GV | apps/server/src/routes/student.ts:600-603 | ✅ |
| E-auth-student-signup-023 | Thư đặt lại mk đã gửi (bình thường hoá) | forget-password mọi trường hợp | minor | FR-003 | form quên mk | kiểm tra mail | apps/student/src/components/auth/forgot-password-form.tsx:14-15 | ✅ |
| E-auth-student-signup-024 | Quá nhiều lần gửi mail đặt lại | rate limit | minor | FR-003 | form quên mk | đợi 1 phút | apps/student/src/components/auth/forgot-password-form.tsx:16-17 | ✅ |
| E-auth-student-signup-025 | Gửi mail đặt lại thất bại | mailer lỗi | major | FR-003 | form quên mk | thử lại | apps/student/src/components/auth/forgot-password-form.tsx:18 | ✅ |
| E-auth-student-signup-026 | Link đặt lại mk hết hạn/sai | INVALID_TOKEN | major | FR-003 | màn link hết hạn | gửi lại yêu cầu | apps/student/src/components/auth/reset-password-form.tsx:63-66 | ✅ |
| E-auth-student-signup-027 | Onboarding thiếu bắt buộc | còn bước trống | minor | FR-025 | wizard | điền đủ | apps/student/src/components/onboarding/onboarding-wizard.tsx:107 | ✅ |
| E-auth-student-signup-028 | Lưu onboarding thất bại | API lỗi | major | FR-025 | wizard | thử lại | apps/student/src/components/onboarding/onboarding-wizard.tsx:126 | ✅ |
| E-auth-student-signup-029 | Gửi lại mail xác thực thất bại | mailer lỗi ở đường resend | minor | FR-006 | màn lỗi portal | thử lại sau | packages/auth/src/index.ts:308-322 · apps/student/src/components/overview/student-error-view.tsx:67,78 — "Không thể gửi lại email. Vui lòng thử lại sau." (fallback; msg server được pass-through) | ✅ |
| E-auth-student-signup-030 | OTP gửi quá dồn | cooldown 60s | minor | FR-010 | form OTP | chờ đếm ngược | packages/auth/src/index.ts:380-424 | ✅ |

## 7. Success Criteria

| ID | Outcome nghiệp vụ | Đo bằng | Mốc đạt | Nguồn | Nhãn |
|----|-------------------|---------|---------|-------|------|
| SC-auth-student-signup-01 | Học viên tự đăng ký không cần GV thao tác | demo luồng signup→verify→portal (E2E có sẵn: apps/e2e/specs/student-portal-email-verification.spec.ts:30-133) | chưa định mức — PDR:23 chỉ khẳng định hướng, không có chỉ tiêu % | docs/project-overview-pdr.md:23 | 🟡 |
| SC-auth-student-signup-02 | Hồ sơ tự tạo đúng org, không trùng email | kiểm tra DB sau lần đầu vào portal | 0 hồ sơ trùng email/org | packages/db/src/schema/student.ts:67-69 | ✅ |
| SC-auth-student-signup-03 | Teacher không thể vào cổng HV | E2E account-role-separation | 0 ca vượt gate | apps/e2e/specs/account-role-separation.spec.ts:63-157 | ✅ |
| SC-auth-student-signup-04 | Học viên hoàn thành onboarding nhanh | đo thời gian thực tế | chưa định mức | (không có trong nguồn) | 🔵 |
| SC-auth-student-signup-05 | Tỷ lệ xác thực email thành công cao | phân tích log mail | chưa định mức | (không có trong nguồn) | 🔵 |

## 8. Data Entities (tóm tắt — chi tiết ở srs/auth-student-signup-reverse-erd.md)

- **USER** — tài khoản: name, email (unique toàn cục), emailVerified, image, role (student/teacher/admin, gán 1 lần). ✅ [S4][S3]
- **SESSION** — phiên đăng nhập gắn user + role chạm app; gate ROLE_MISMATCH đọc ở đây. ✅ [S4]
- **ACCOUNT** — liên kết đăng nhập (credential hoặc google) theo userId. ✅ [S4]
- **VERIFICATION** — token xác thực email / đặt lại mật khẩu, hết hạn theo cấu hình. ✅ [S4]
- **ORGANIZATION** — tổ chức (chi nhánh/trung tâm); "sớm nhất toàn cục" tính theo createdAt, id. ✅ [S5][S8]
- **STUDENT** — hồ sơ học viên theo org: email lower/trim, tên, SĐT/zalo/PH trống lúc tạo, bộ mục tiêu onboarding, onboardingCompletedAt, unique(org,email). ✅ [S3]
- **STUDENT_INVITATION** — lời mời vào org theo email, status pending chặn auto-provision. ✅ [S8]
- **MEMBER (membership org)** — thành viên org của GV/admin (plugin organization), không phải hồ sơ học viên. 🔵 [S4]

## 9. Flows (tóm tắt — chi tiết ở srs/auth-student-signup-reverse-flows.md)

- **F1 Đăng ký email/mật khẩu → xác thực → auto sign-in** — luồng chính feature. ✅ [S4][S11]
- **F2 Đăng nhập Google lần đầu** — role student theo origin portal; portal HV rồi tự provision. ✅ [S4]
- **F3 Lần đầu vào portal → provisioning org sớm nhất toàn cục** — trái tim của feature. ✅ [S8]
- **F4 Teacher bị chặn vào portal học viên** — 403 ACCOUNT_TEACHER_ROLE, có nút sang cổng GV. ✅ [S6][S7]
- **F5 Đăng nhập OTP email** — tab mặc định; xác thực luôn email; chống hijack. ✅ [S4]
- **F6 Quên / đặt lại mật khẩu** — token 1 giờ, bình thường hoá thông điệp, thu hồi phiên. 🔵 [S4]

## 10. Screens (tóm tắt)

- Trang login 3 tab: OTP (mặc định) / Đăng nhập / Đăng ký; nhớ tab cuối; đọc returnUrl,error,error_description từ URL. ✅ [S11]
- Form đăng ký: name, email, password; validate zod client. ✅ [S11]
- Form OTP: nhập email → gửi mã → nhập 6 số; đếm ngược 60s; 4 nhóm lỗi toast. ✅ [S11]
- Form đăng nhập mật khẩu: email + password. ✅ [S11]
- Nút Google OAuth; lỗi quay lại /login kèm error. ✅ [S11]
- Màn verify-email: thành công khi ?verified=ok và không có error. ✅ [S11]
- Form quên mật khẩu: gửi link, cooldown 60s, 3 thông điệp trạng thái. ✅ [S11]
- Form đặt lại mật khẩu: token từ URL; link hết hạn có màn riêng. ✅ [S11]
- Onboarding wizard 5 bước với选项 ielts/toeic, mức hiện tại, điểm mục tiêu, mục tiêu học, giờ tự học. ✅ [S11]
- Màn lỗi portal 4 trạng thái: teacher / chưa liên kết / chưa xác thực (có nút gửi lại) / trùng hồ sơ + mặc định. ✅ [S11]
- Chuông thông báo nhận lời mời + accept vào org (luồng lời mời — chỉ chạm mé). ✅ [S8]
- Chuyển org (org switcher) khi học viên thuộc nhiều org; chọn qua header/query. ✅ [S8]

## 11. Constraints, Dependencies & Assumptions

**Constraints (ràng buộc áp đặt):**

| Ràng buộc | Source / Owner | Nguồn | Nhãn |
|-----------|----------------|-------|------|
| Cookie chung nhiều sub-domain (SameSite=None) → bắt buộc CSRF Origin check | Kiến trúc auth | apps/server/src/routes/student.ts:433-498 | ✅ |
| STUDENT_ORIGINS cấu hình binding; origin không khớp → mặc định student | DevOps / plan #260 | apps/server/src/index.ts:75,165-166 | ✅ |
| Better-auth quy định schema user/session/account/verification | Thư viện | packages/auth/src/index.ts | ✅ |
| D1 (SQLite) + Drizzle; unique partial index WHERE trim != '' | Nền tảng dữ liệu | packages/db/src/schema/student.ts:67-69 | ✅ |
| Mail gửi bằng Resend hoặc log-only tùy môi trường | Hạ tầng mail | packages/auth/src/mail/mailer.ts | ✅ |

**Dependencies (deliverable do bên khác sở hữu):**

| Phụ thuộc | Owner | Blocks nếu chưa sẵn | Nguồn | Nhãn |
|-----------|-------|---------------------|-------|------|
| Hộp mail học viên nhận được mail | ngoài (nhà cung cấp mail) | luồng verify/OTP/reset | packages/auth/src/mail/* | ✅ |
| Google OAuth client-id/secret | DevOps | F2 | packages/auth/src/index.ts | ✅ |
| Ít nhất 1 ORGANIZATION tồn tại | admin/seed | F3 chọn org | apps/server/src/student-provisioning.ts:53-64 | ✅ |
| STUDENT_ORIGINS/TEACHER_EMAILS/ADMIN_EMAILS cấu hình đúng môi trường | DevOps | phân vai sai | apps/server/src/index.ts:75,78-80 | 🔵 |

**Assumptions (tin là đúng — nêu hệ quả nếu sai):**

| Giả định | Invalidate {X} nếu sai | Nguồn | Nhãn |
|----------|------------------------|-------|------|
| Một email chỉ thuộc một vai (không thể vừa HV vừa GV) | toàn bộ gate role | packages/auth/src/index.ts:501-538 | ✅ |
| Better-auth mặc định chấp nhận mật khẩu ≥8 ký tự phía server | FR-026 | (mặc định thư viện, không thấy cấu hình) | 🔵 |
| "Org sớm nhất" là tổ chức chính/trụ sở lâu đời nhất | ý nghĩa nghiệp vụ của F3 | apps/server/src/student-provisioning.ts:53-64 | 🔵 |
| Student có thể thuộc nhiều org cùng lúc | mô hình multi-org | apps/server/src/routes/student.ts:676-713 | 🔵 |

## 12. Open Questions

> Danh sách đầy đủ OQ + Gap ở [reverse-gaps.md](./reverse-gaps.md). Dưới đây chỉ trích các OQ blocking.

- [ ] OQ-1: Chính sách mật khẩu phía server là gì (độ dài tối thiểu, chữ hoa/số)? Chỉ thấy ≥8 ở client.
- [ ] OQ-5: "Org sớm nhất toàn cục" là chủ đích nghiệp vụ (org đầu tiên = trung tâm chính) hay mặc định kỹ thuật? Ảnh hưởng mọi học viên tự đăng ký mới.
- [ ] OQ-6: `POST /api/students` (tạo hồ sơ thủ công) còn đường nghiệp vụ nào không, trong khi PDR nói GV không còn tự tạo hồ sơ?
