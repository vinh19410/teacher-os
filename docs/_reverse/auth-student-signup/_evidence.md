# auth-student-signup — Evidence base (truy vết code → luồng)

## §1. Endpoints (điểm vào)

| Method | Path | Màn/route gọi | Auth | Mục đích nghiệp vụ | Nguồn (file:line) |
|--------|------|---------------|------|--------------------|-------------------|
| POST | /api/auth/sign-up/email | Form Đăng ký | công khai | Tạo tài khoản + gửi mail xác thực | packages/auth/src/index.ts:298-326 |
| POST | /api/auth/sign-in/email | Form Đăng nhập | công khai | Đăng nhập mật khẩu | apps/student/src/lib/auth-client.ts |
| POST | /api/auth/verify-email | Link trong mail | token | Xác thực email + auto sign-in | packages/auth/src/index.ts:298-326 |
| POST | /api/auth/send-verification-email | Nút gửi lại | session/công khai | Gửi lại link xác thực | packages/auth/src/index.ts:299-322 |
| POST | /api/auth/forget-password | Form quên mk | công khai | Gửi link đặt lại mật khẩu | apps/student/src/components/auth/forgot-password-form.tsx |
| POST | /api/auth/reset-password | Form đặt lại mk | token | Đổi mật khẩu + thu hồi phiên | apps/student/src/components/auth/reset-password-form.tsx:56-70 |
| POST | /api/auth/sign-in/google | Nút Google | công khai | Bắt đầu OAuth Google | apps/student/src/components/auth/google-oauth-button.tsx:48 |
| GET | /api/auth/callback/google | Google redirect | code | Kết thúc OAuth, tạo user/role | packages/auth/src/index.ts:436-498 |
| POST | /api/auth/email-otp/send-verification-otp | Form OTP bước 1 | công khai | Gửi mã OTP 6 số | packages/auth/src/index.ts:564-596 |
| POST | /api/auth/sign-in/email-otp | Form OTP bước 2 | công khai | Đăng nhập bằng OTP | packages/auth/src/index.ts:564-596 |
| GET | /api/student/me | Overview portal | session student | Lấy hồ sơ học viên (auto-provision trước) | apps/server/src/routes/student.ts:124-210 |
| GET | /api/student/orgs | Org switcher | session student | Liệt kê org của học viên | apps/server/src/routes/student.ts:676-713 |
| POST | /api/student/onboarding | Wizard 5 bước | session student | Lưu mục tiêu học tập | apps/server/src/routes/student.ts:1241-1290 |
| POST | /api/student/invitations/:id/accept | Chuông thông báo | session student | Nhận lời mời vào org | apps/server/src/routes/student.ts:579-639 |

## §2. Validation (ràng buộc field)

| Field | Rule | Giá trị exact | Lỗi khi vi phạm | Nguồn (file:line) | Nhãn |
|-------|------|---------------|-----------------|-------------------|------|
| name | min length | >= 2 | "Tên phải có ít nhất 2 ký tự" | apps/student/src/lib/auth-schemas.ts:6 | ✅ |
| email (sign-up/sign-in) | bắt buộc | — | "Vui lòng nhập email" | apps/student/src/lib/auth-schemas.ts:3 | ✅ |
| email | định dạng | z.email() | "Email không hợp lệ" | apps/student/src/lib/auth-schemas.ts:4 | ✅ |
| password | bắt buộc | — | "Vui lòng nhập mật khẩu" | apps/student/src/lib/auth-schemas.ts:5 | ✅ |
| password (client) | min length | >= 8 | "Mật khẩu phải có ít nhất 8 ký tự" | apps/student/src/lib/auth-schemas.ts:7 | ✅ |
| password (server) | chính sách? | chưa thấy cấu hình | chưa rõ | negative-search packages/auth/src/index.ts | 🟡 |
| otp | 6 chữ số | regex 6 digit | giữ ở form, không gửi | apps/student/src/components/auth/otp-sign-in-form.tsx:100-108 | ✅ |
| otp-email | định dạng email | regex tự viết | chặn gửi mã | apps/student/src/components/auth/otp-sign-in-form.tsx:51-63 | ✅ |
| returnUrl | whitelist redirect | chỉ path nội bộ, 1 dấu "/" đầu, cấm "//", "/\", scheme:, ký tự điều khiển, 2 vòng decode | bỏ tham số, về trang mặc định | apps/student/src/routes/login.tsx (validateReturnUrl) | ✅ |
| examInterest | enum | ielts, toeic | chặn submit | packages/api/src/contracts.ts:2000,2050 | ✅ |
| currentLevel | enum | CURRENT_LEVEL_OPTIONS | chặn submit | packages/api/src/contracts.ts:2052 | ✅ |
| targetScore | phải thuộc bộ điểm của exam (superRefine) | IELTS_TARGET_BANDS / TOEIC_TARGET_SCORES | "targetScore must be one of ..." | packages/api/src/contracts.ts:2054,2063-2073 | ✅ |
| learningGoals | min 1, không trùng | .min(1) + Set size == length | chặn submit | packages/api/src/contracts.ts:2055-2058 | ✅ |
| learningGoalsNote | tối đa 200, trim, tùy chọn | .max(200) | chặn submit | packages/api/src/contracts.ts:2059 | ✅ |
| dailyStudyHours | enum | DAILY_STUDY_HOUR_OPTIONS | chặn submit | packages/api/src/contracts.ts:2060 | ✅ |
| entryScore | <= 50 ký tự, tùy chọn | entryScoreSchema | chặn submit | packages/api/src/contracts.ts:2061 | ✅ |

## §3. Errors (lỗi + wording thật)

| Error ID | Trigger | Wording exact (câu thật) | Recovery | Nguồn throw + catalog (file:line) | Nhãn |
|----------|---------|--------------------------|----------|-----------------------------------|------|
| E-01 name | name < 2 | "Tên phải có ít nhất 2 ký tự" | sửa form | apps/student/src/lib/auth-schemas.ts:6 | ✅ |
| E-02 email req | email rỗng | "Vui lòng nhập email" | sửa form | apps/student/src/lib/auth-schemas.ts:4 | ✅ |
| E-03 email fmt | sai định dạng | "Email không hợp lệ" | sửa form | apps/student/src/lib/auth-schemas.ts:5 | ✅ |
| E-04 pwd req | rỗng | "Vui lòng nhập mật khẩu" | sửa form | apps/student/src/lib/auth-schemas.ts:7 | ✅ |
| E-05 pwd min | < 8 | "Mật khẩu phải có ít nhất 8 ký tự" | sửa form | apps/student/src/lib/auth-schemas.ts:9 | ✅ |
| E-06 pwd server | chính sách server | (chưa rõ — OQ-1) | sửa form | negative-search packages/auth/src/index.ts | 🟡 |
| E-07 OTP teacher | teacher xin OTP | "Tài khoản giáo viên không thể đăng nhập vào cổng học viên." | sang portal GV | apps/student/src/components/auth/otp-sign-in-form.tsx:133-135 · catalog packages/auth/src/index.ts:380-424 | ✅ |
| E-08 OTP limit | sai quá nhiều | "Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới." | gửi mã mới | apps/student/src/components/auth/otp-sign-in-form.tsx:139-141 | ✅ |
| E-09 OTP invalid | mã sai/hết hạn | "Mã xác thực không đúng hoặc đã hết hạn." | gửi lại mã | apps/student/src/components/auth/otp-sign-in-form.tsx:146,152 | ✅ |
| E-10 OTP path khoá | path email-otp bị cấm | "Endpoint này không khả dụng." | dùng đường chính thức | packages/auth/src/index.ts:374-377 | ✅ |
| E-11 student→GV | student chạm app GV | "Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên." | về portal HV | packages/auth/src/index.ts:92-94 | ✅ |
| E-12 teacher→portal | teacher đăng nhập portal | "Tài khoản giáo viên không thể đăng nhập vào cổng học viên." | sang portal GV | packages/auth/src/index.ts:96-97 | ✅ |
| E-13 admin gate | role khác chạm admin | "Tài khoản này không được phép đăng nhập vào cổng quản trị." | dùng cổng đúng | packages/auth/src/index.ts:98-99 | ✅ |
| E-14 verify trễ | ROLE_MISMATCH sau verify | redirect `callbackURL + error=ROLE_MISMATCH` → toast login | đăng nhập đúng cổng | packages/auth/src/index.ts:524-533 · apps/student/src/routes/login.tsx:59-63 | ✅ |
| E-15 Google fail | OAuth lỗi | "Đăng nhập Google thất bại. Vui lòng thử lại." | thử lại | apps/student/src/routes/login.tsx:59-63 | ✅ |
| E-16 teacher→portal API | 403 ACCOUNT_TEACHER_ROLE | "Đây là tài khoản giáo viên" + "Tài khoản này thuộc hệ thống giáo viên, không đăng nhập được cổng học viên. Bạn có thể chuyển sang cổng giáo viên hoặc đăng xuất để đăng nhập bằng tài khoản học viên." | nút sang cổng GV | apps/server/src/routes/student.ts:511-512 · apps/student/src/components/overview/student-error-view.tsx:98-103 | ✅ |
| E-17 not linked | không có hồ sơ | "Tài khoản chưa được liên kết" + "Email (...) hiện chưa tham gia lớp học nào. Nếu giáo viên đã gửi lời mời, vui lòng bấm vào biểu tượng Chuông thông báo ở góc trên để chấp nhận tham gia lớp." | chờ/nhận lời mời | apps/server/src/routes/student.ts:166-174 · student-error-view.tsx:104-107 | ✅ |
| E-18 unverified | emailVerified=false | "Email chưa được xác thực" + "Chúng tôi đã gửi liên kết xác thực đến {email}. Mở email và nhấn nút "Xác thực email" để kích hoạt hồ sơ học viên. Nếu không thấy, hãy kiểm tra mục Spam hoặc gửi lại liên kết." | bấm link / gửi lại | apps/server/src/routes/student.ts:130-138 · student-error-view.tsx:108-113 | ✅ |
| E-19 ambiguous | >1 hồ sơ trùng email | "Thông tin tài khoản chưa rõ ràng" + "Hệ thống ghi nhận nhiều hơn một hồ sơ học viên trùng với email của bạn. Vui lòng liên hệ trung tâm để được chuẩn hóa danh tính." | liên hệ trung tâm | apps/student/src/components/overview/student-error-view.tsx:114-118 · catalog packages/api/src/contracts.ts:1967-1971 | ✅ |
| E-20 portal default | mã khác | "Không thể truy cập cổng học viên" + "Đã xảy ra lỗi trong quá trình xác thực thông tin học viên. Vui lòng thử lại sau." | thử lại | apps/student/src/components/overview/student-error-view.tsx:82-84 | ✅ |
| E-21 student→GV API | 403 ACCOUNT_STUDENT_ROLE | (code ACCOUNT_STUDENT_ROLE) | về portal HV | apps/server/src/app.ts:227-228 · catalog packages/api/src/contracts.ts:1981-1996 | ✅ |
| E-22 invite không còn | không tìm thấy pending | "Lời mời không tồn tại hoặc đã được xử lý" (code INVITATION_NOT_FOUND) | liên hệ GV | apps/server/src/routes/student.ts:600-603 · catalog packages/api/src/contracts.ts:2913-2921 | ✅ |
| E-23 forgot sent | gửi link đặt lại | "Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ." | kiểm tra mail | apps/student/src/components/auth/forgot-password-form.tsx:14-15 | ✅ |
| E-24 forgot rate | quá dồn | "Bạn thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại." | đợi 1 phút | apps/student/src/components/auth/forgot-password-form.tsx:16-17 | ✅ |
| E-25 forgot fail | mailer lỗi | "Không gửi được email đặt lại. Vui lòng thử lại." | thử lại | apps/student/src/components/auth/forgot-password-form.tsx:18 | ✅ |
| E-26 reset link hết hạn | INVALID_TOKEN | màn "Link không hợp lệ/hết hạn" (InvalidLinkView) | gửi lại yêu cầu | apps/student/src/components/auth/reset-password-form.tsx:63-66 | ✅ |
| E-27 onboarding thiếu | còn trống | "Vui lòng điền đầy đủ các thông tin bắt buộc." | điền đủ | apps/student/src/components/onboarding/onboarding-wizard.tsx:107 | ✅ |
| E-28 onboarding lưu lỗi | API lỗi | "Không thể lưu thông tin. Vui lòng thử lại." | thử lại | apps/student/src/components/onboarding/onboarding-wizard.tsx:126 | ✅ |
| E-29 resend verify fail | mailer lỗi đường resend | "Không thể gửi lại email. Vui lòng thử lại sau." (fallback, msg server pass-through) | thử lại sau | packages/auth/src/index.ts:308-322 · apps/student/src/components/overview/student-error-view.tsx:67,78 | ✅ |
| E-30 OTP cooldown | gửi dồn | chặn gửi + đếm ngược 60s ở form (countdown line 87) | chờ | packages/auth/src/index.ts:380-424 · otp-sign-in-form.tsx:87 | ✅ |

## §4. Business Rules (rule + hằng số + state transition)

| Rule | Trigger | Hằng số/ngưỡng | Có test phủ? | Nguồn (file:line) | Nhãn |
|------|---------|----------------|--------------|-------------------|------|
| Role gán 1 lần lúc tạo user | user.create.before | role = appRole từ origin | có (packages/auth/src/auth-teacher-signup.test.ts) | packages/auth/src/index.ts:436-498 (495) | ✅ |
| Origin không khớp → student mặc định | resolveRequestApp | "student" | có (packages/auth/src/role.test.ts) | packages/auth/src/role.ts:60 | ✅ |
| Allowlist teacher | signup origin GV | TEACHER_EMAILS | có (auth-teacher-signup.test.ts) | packages/auth/src/index.ts:436-498 | ✅ |
| Allowlist admin | signup origin admin | ADMIN_EMAILS | có (auth-admin-signup.test.ts) | packages/auth/src/index.ts:436-498 | ✅ |
| Gate session ↔ app role | session.create.before | 403 ROLE_MISMATCH | có (apps/server/src/role-gates.test.ts:190-283) | packages/auth/src/index.ts:501-538 | ✅ |
| Verify-email trễ redirect | path /verify-email + callbackURL | ?error=ROLE_MISMATCH | có (packages/auth/src/auth-verify-email-role.test.ts:77-113) | packages/auth/src/index.ts:524-533 | ✅ |
| OTP hiệu lực + băm | gửi OTP | 300 giây, hashed | có (packages/auth/src/auth-email-otp.test.ts) | packages/auth/src/index.ts:564-596 | ✅ |
| OTP cooldown | gửi lại | 60 giây | có (packages/auth/src/auth-email-otp.test.ts) | packages/auth/src/index.ts:380-424 | ✅ |
| Chặn OTP teacher | teacher request | không gửi mã | có (apps/server/src/routes/student-auth-otp.test.ts:100-199, kịch bản A/B/C) | packages/auth/src/index.ts:380-424 | ✅ |
| OTP login = xác thực email + chống hijack | sign-in/email-otp | emailVerified=true, xóa credential chưa verify | có (auth-email-otp.test.ts:268-317) | packages/auth/src/index.ts:564-596 | ✅ |
| Email verification on signup | sign-up | sendOnSignUp, autoSignInAfterVerification, 3600s | có (packages/auth/src/auth-verification-email.test.ts) | packages/auth/src/index.ts:298-326 | ✅ |
| Mail sign-up fail-open, resend throw | sendVerificationEmail | isResendPath | có (packages/auth/src/auth-verification-email.test.ts) | packages/auth/src/index.ts:299-322 | ✅ |
| Provision chỉ khi chưa có hồ sơ | GET /api/student/me | lower(trim(email)) khớp = 0 dòng | có (apps/server/src/student-provisioning.test.ts) | apps/server/src/student-provisioning.ts:27-35 | ✅ |
| Pending invite chặn provision | GET /api/student/me | status = pending | có (student-provisioning.test.ts) | apps/server/src/student-provisioning.ts:37-51 | ✅ |
| Org sớm nhất toàn cục | provision | createdAt ASC, id ASC, limit 1 | có (student-provisioning.test.ts) | apps/server/src/student-provisioning.ts:53-64 | ✅ |
| Hồ sơ mới trống liên hệ | provision | phone/zalo/parentName/parentPhone = "" | có (student-provisioning.test.ts) | apps/server/src/student-provisioning.ts:67-76 | ✅ |
| Provision fail-open | lỗi CSDL | chỉ console.error | có (student-provisioning.test.ts) | apps/server/src/student-provisioning.ts:77-83 | ✅ |
| "Org sớm nhất" là chủ đích nghiệp vụ | — | — | không (không có chú thích/plan trích dẫn) | apps/server/src/student-provisioning.ts:53-64 | 🟡 |
| Unique hồ sơ theo org+email | insert | UNIQUE(org_id, lower(trim(email))) WHERE trim != '' (migration 0025) | có (schema + migration) | packages/db/src/schema/student.ts:67-69 | ✅ |
| user.email unique toàn cục | đăng ký | better-auth unique | có (mặc định lib + test signup) | packages/auth/src/index.ts | ✅ |

## §5. Entities (đối tượng dữ liệu nghiệp vụ)

| Entity | Field nghiệp vụ chính | Quan hệ | Nguồn (file:line) |
|--------|-----------------------|---------|-------------------|
| USER | name, email unique, emailVerified, image, role (student/teacher/admin) | 1-N session/account; email ↔ student | packages/auth/src/index.ts:436-498 |
| SESSION | userId, role chạm app (impliedUser?), expires | N-1 user | packages/auth/src/index.ts:501-538 |
| ACCOUNT | provider (credential/google), userId | N-1 user | packages/auth/src/index.ts:564-596 (xóa credential) |
| VERIFICATION | identifier (email), token, expiresAt | N-1 user (logic theo email) | packages/auth/src/index.ts:298-326 |
| ORGANIZATION | id, name, createdAt | 1-N student/invitation/member | apps/server/src/student-provisioning.ts:53-64 |
| STUDENT | orgId, email, name, phone, zalo, parentName, parentPhone, examInterest, currentLevel, targetScore, learningGoals, learningGoalsNote, dailyStudyHours, entryScore, onboardingCompletedAt | N-1 org; khớp user theo email | packages/db/src/schema/student.ts:33-69 |
| STUDENT_INVITATION | orgId, email (lower/trim), status (pending/…), expires | N-1 org; khớp user theo email | apps/server/src/routes/student.ts:579-639 |
| MEMBER | orgId, userId, role trong org | N-1 org, N-1 user (GV/admin) | packages/auth/src/index.ts (plugin organization) |

## §6. Cross-repo hops (điểm nghiệp vụ → luồng liên quan)

| Điểm khởi phát | → tới đâu | Cơ chế (đọc/ghi/gọi) | Luồng nghiệp vụ liên quan | Nguồn 2 đầu (file:line) |
|----------------|-----------|----------------------|---------------------------|-------------------------|
| apps/student form đăng ký | POST /api/auth/sign-up/email (packages/auth) | HTTP gọi | F1 đăng ký | apps/student/src/components/auth/sign-up-form.tsx:43 · packages/auth/src/index.ts:298-326 |
| auth hook sendVerificationEmail | mailer (packages/auth/src/mail) | gọi nội bộ + runInBackground | F1 gửi mail | packages/auth/src/index.ts:299-322 |
| Link mail verify | GET /verify-email (portal) → callback /login | redirect trình duyệt | F1 xác thực xong | apps/student/src/routes/verify-email.tsx · apps/student/src/components/auth/verify-email-view.tsx:25 |
| session.create.before ROLE_MISMATCH | redirect callbackURL + error (portal login) | HTTP redirect | F4 chặn chéo | packages/auth/src/index.ts:524-533 · apps/student/src/routes/login.tsx:59-63 |
| apps/student GET /api/student/me | apps/server guard → packages/server provisioning → packages/db | HTTP → DB insert/requery | F3 provisioning | apps/server/src/routes/student.ts:148-164 · apps/server/src/student-provisioning.ts:27-83 |
| contracts.ts error codes | apps/student UI error map | import hằng số | mọi màn lỗi | packages/api/src/contracts.ts:1967-1996 · apps/student/src/components/overview/student-error-view.tsx:98-118 |
| E2E mail log | helper verifyStudentEmailFromMailLog | đọc log mail cục bộ | kiểm thử F1 | apps/e2e/specs/student-portal-email-verification.spec.ts:30-133 |

## §7. Gaps / Ambiguities (code câm hoặc nghi ngờ)

* Chính sách mật khẩu server không cấu hình — *(negative-search: grep `minPassword` packages/auth/src → 0 hit · loại: code-câm)*
* Session TTL không cấu hình — *(grep `expiresIn` packages/auth/src/index.ts → chỉ thấy verification/reset 3600 · loại: code-câm)*
* Không cooldown cho gửi lại mail xác thực — *(cooldown chỉ ở OTP 380-424 và forgot-password 60s · loại: code-câm)*
* emailVerified cho đăng nhập Google không thấy xử lý — *(grep `emailVerified` packages/auth/src → chỉ thấy đường OTP · loại: code-câm)*
* Ngưỡng rate-limit OTP server không cấu hình tường minh — *(client chỉ bắt lỗi TOO_MANY_ATTEMPTS · loại: code-câm)*
* ~~AUTH_ASSUME_EMAIL_VERIFIED không có guard môi trường~~ — guard ở tầng infra: packages/infra/src/topology.ts:140-149 throw trên prod domain (grep cũ chỉ quét apps/server/src · đã giải quyết)
* ~~Wording lỗi resend-verify ở UI~~ — đã xác định: "Không thể gửi lại email. Vui lòng thử lại sau." (student-error-view.tsx:67,78 · đã giải quyết)
