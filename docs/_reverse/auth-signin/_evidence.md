# auth-signin — Evidence base (truy vết code → luồng)

Quy ước: đường dẫn tính từ gốc repo `/root/projects/teacher-os/`.

## §1. Endpoints (điểm vào)

| Method | Path | Màn/route gọi | Auth | Mục đích nghiệp vụ | Nguồn (file:line) |
|--------|------|---------------|------|--------------------|-------------------|
| POST/GET | `/api/auth/*` (biên Better-Auth mount) | mọi màn đăng nhập | công khai | Toàn bộ đăng nhập/đăng ký/quên mật khẩu/xác thực/OTP đi qua biên này | `apps/server/src/app.ts:406-407`, `packages/auth/src/topology.ts:10-21` |
| POST | `/api/auth/sign-in/email` | `/login` (form email/mật khẩu) | công khai | Đăng nhập mật khẩu | cấu hình `packages/auth/src/index.ts:258-333`; UI `apps/web/src/components/sign-in-form.tsx:40-44` |
| POST | `/api/auth/sign-up/email` | `/login` tab đăng ký (cờ bật) | công khai + allowlist | Tạo tài khoản theo allowlist cổng | `packages/auth/src/index.ts:440-480`; UI `apps/web/src/components/sign-up-form.tsx:38-49` |
| POST | `/api/auth/sign-in/social` (Google) | nút Google | công khai | Bắt đầu OAuth, server đóng dấu cổng vào state | `packages/auth/src/index.ts:248-257,335-364`; UI `apps/web/src/components/google-oauth-button.tsx:48` |
| GET | `/api/auth/callback/google` | Google redirect | state OAuth | Callback gán vai + tạo phiên | `packages/auth/src/index.ts:220-239,481-497` |
| POST | `/api/auth/forget-password` | `/forgot-password` | công khai | Gửi link đặt lại (1 giờ) | `packages/auth/src/index.ts:258-297`; UI `apps/web/src/components/auth/forgot-password-form.tsx:40-50` |
| POST | `/api/auth/reset-password` | `/reset-password` | token trong bảng verification | Đổi mật khẩu + thu hồi phiên | `packages/auth/src/index.ts:258-266`; UI `apps/web/src/components/auth/reset-password-form.tsx:55-75` |
| POST | `/api/auth/verify-email` | link thư → `/verify-email` | token | Đánh dấu đã xác thực + tự đăng nhập | `packages/auth/src/index.ts:298-326,501-538` |
| POST | `/api/auth/send-verification-email` | màn chặn, `/verify-email` | công khai | Gửi lại thư xác thực (báo to khi lỗi) | `packages/auth/src/auth-verification-email.test.ts:34-143`; UI `apps/web/src/components/account-blocked-view.tsx:44-77` |
| POST | `/api/auth/sign-in/email-otp` (+ gửi OTP) | cổng học viên | công khai + chỉ học viên | Đăng nhập OTP 5 phút | `packages/auth/src/index.ts:151-198,366-425,564-596` |
| GET | `/api/auth/get-session` | mọi ứng dụng | cookie phiên | Đọc phiên (client cache 10s) | `apps/web/src/lib/auth-client.ts:40,64-123` |
| * | kernel tree API giáo viên | vùng làm việc | phiên teacher | Gate tầng 2 + bootstrap tổ chức | `apps/server/src/app.ts:202-303` |
| * | API cổng học viên | cổng học viên | phiên student | Gate tầng 3 | `apps/server/src/routes/student.ts:497-545` |
| * | API quản trị (`/api/admin`) | console admin | gate admin mỗi request | Gate tầng admin + `/api/admin/me` | `apps/server/src/lib/require-admin.ts:27-66` |

## §2. Validation (ràng buộc field)

| Field | Rule | Giá trị exact | Lỗi khi vi phạm | Nguồn (file:line) | Nhãn |
|-------|------|---------------|-----------------|-------------------|------|
| email (đăng nhập) | bắt buộc + trim + định dạng | min 1 sau trim | `Email is required` / `Invalid email address` | `apps/web/src/lib/sign-in-schema.ts:15` | ✅ |
| password (đăng nhập) | bắt buộc, KHÔNG kiểm độ dài | min 1 | `Password is required` | `apps/web/src/lib/sign-in-schema.ts:16` | ✅ |
| name (đăng ký) | tối thiểu 2 ký tự | min 2 | `Name must be at least 2 characters` | `apps/web/src/lib/sign-up-schema.ts:5,14` | ✅ |
| password (đăng ký) | tối thiểu 8 ký tự | min 8 | `Password must be at least 8 characters` | `apps/web/src/lib/sign-up-schema.ts:6,16` | ✅ |
| newPassword (đặt lại) | tối thiểu 8 ký tự | min 8 | `Password must be at least 8 characters` | `apps/web/src/components/auth/reset-password-form.tsx:23` | ✅ |
| confirmPassword | khớp newPassword | equal | `Passwords do not match` | `apps/web/src/components/auth/reset-password-form.tsx:25-28` | ✅ |
| name (cập nhật hồ sơ) | 2-100 ký tự sau trim | 2..100 | câu tiếng Việt quá ngắn/quá dài | `packages/auth/src/avatar-policy.ts:33-37` | ✅ |
| image (cập nhật hồ sơ) | PNG/JPEG data URL hoặc https, giới hạn kích thước | 192px mục tiêu; 64*1024 ký tự tối đa | loại ảnh không an toàn → bỏ ảnh | `packages/auth/src/avatar-policy.ts:9-13,41-49` | ✅ |
| returnUrl | chỉ đường dẫn trong cùng app; cấm "//", "/\", scheme:, ký tự điều khiển; decode tối đa 2 vòng | default `/dashboard` | rơi về mặc định | `apps/web/src/lib/kernel-load-state.ts:149,156-212` | ✅ |
| tiền tố cookie / domain cookie | regex `^[a-z0-9-]+$`; domain chéo sub-domain phải bắt đầu bằng dấu chấm | — | cấu hình sai → chặn khởi động | `packages/auth/src/topology.ts:29-50,60-71` | ✅ |

## §3. Errors (lỗi + wording thật)

Đối chiếu 1-1 với Ma trận lỗi Mục 6 của spec (E-SIGNIN-001 → E-SIGNIN-030). Mỗi dòng: nơi phát sinh + nơi hiện thị.

| Error ID | Trigger | Wording exact (câu thật) | Recovery | Nguồn throw + hiển thị (file:line) | Nhãn |
|----------|---------|--------------------------|----------|-------------------------------------|------|
| E-SIGNIN-001/002/003 | thiếu email/mật khẩu, sai định dạng | `Email is required` · `Password is required` · `Invalid email address` | nhập lại | `apps/web/src/lib/sign-in-schema.ts:3-5` | ✅ |
| E-SIGNIN-004 | sai thông tin đăng nhập | `Couldn't sign you in. Check your email and password, then try again.` | thử lại | `apps/web/src/components/sign-in-form.tsx:32-33,45-48` | ✅ |
| E-SIGNIN-005 | 2xx nhưng không phiên | `We couldn't start your session. Please try signing in again.` | đăng nhập lại | `apps/web/src/components/sign-in-form.tsx:49-62` | ✅ |
| E-SIGNIN-006 | học viên vào trang giáo viên | `Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên.` | sang cổng học viên | throw `packages/auth/src/index.ts:92-93` · E2E `apps/e2e/specs/account-role-separation.spec.ts:89` | ✅ |
| E-SIGNIN-007 | giáo viên vào cổng học viên (tạo phiên) | `Tài khoản giáo viên không thể đăng nhập vào cổng học viên.` | dùng app giáo viên | throw `packages/auth/src/index.ts:95-96` | ✅ |
| E-SIGNIN-008 | vai khác vào cổng quản trị (tạo phiên) | `Tài khoản này không được phép đăng nhập vào cổng quản trị.` | dùng cổng admin | throw `packages/auth/src/index.ts:98-99` · E2E `apps/e2e/specs/admin-auth.spec.ts:40` | ✅ |
| E-SIGNIN-009 | Google thất bại / mã lỗi lạ trên URL | `Đăng nhập Google thất bại. Vui lòng thử lại.` | thử lại | `apps/web/src/routes/login.tsx:51-61` · `apps/web/src/components/google-oauth-button.tsx:55-58` | ✅ |
| E-SIGNIN-010 | student chạm kernel | 403 `ACCOUNT_STUDENT_ROLE`; màn chặn `Đây là tài khoản học viên` | đăng xuất | `apps/server/src/app.ts:224-232` · `apps/web/src/components/account-blocked-view.tsx:88-90` · catalog `packages/api/src/contracts.ts:1982` | ✅ |
| E-SIGNIN-011 | admin chạm kernel | 403 `ACCOUNT_ADMIN_ROLE` (UI chưa có màn riêng — G-5) | dùng console | `apps/server/src/app.ts:235-243` · catalog `packages/api/src/contracts.ts:1985` | ✅ |
| E-SIGNIN-012 | giáo viên ngoài allowlist | `Tài khoản này không có quyền dùng ứng dụng giáo viên (thuộc cổng học viên hoặc email chưa nằm trong danh sách được phép). Vui lòng đăng xuất để tiếp tục.` | liên hệ chủ tài khoản | `apps/server/src/app.ts:246-257` · `apps/web/src/components/account-blocked-view.tsx:97-103` · catalog `packages/api/src/contracts.ts:1993` | ✅ |
| E-SIGNIN-013 | giáo viên chưa xác thực email | `Email giáo viên ({email}) chưa được xác thực. Vui lòng mở hộp thư và bấm liên kết xác thực trước khi truy cập ứng dụng, hoặc gửi lại email xác thực bên dưới.` | bấm link / gửi lại | `apps/server/src/app.ts:258-269` · `apps/web/src/components/account-blocked-view.tsx:91-96` · catalog `packages/api/src/contracts.ts:1995` | ✅ |
| E-SIGNIN-014 | vai khác gọi API học viên | 403 `ACCOUNT_TEACHER_ROLE` | dùng cổng đúng | `apps/server/src/routes/student.ts:500-516` · catalog `packages/api/src/contracts.ts:1983` | ✅ |
| E-SIGNIN-015 | không thỏa gate admin | 403 `ACCOUNT_NOT_ADMIN`; toast `Tài khoản của bạn không có quyền quản trị.` | đăng nhập email admin | `apps/server/src/lib/require-admin.ts:38-45` · E2E `apps/e2e/specs/admin-auth.spec.ts:27` | ✅ |
| E-SIGNIN-016 | đăng ký origin admin ngoài allowlist | `Email này không được cấp quyền quản trị. Vui lòng dùng cổng học viên hoặc liên hệ quản trị viên.` | liên hệ quản trị | `packages/auth/src/index.ts:449-454` | ✅ |
| E-SIGNIN-017/018 | đăng ký sai chiều allowlist giáo viên | `Ứng dụng giáo viên hiện chỉ dành cho chủ tài khoản. Học viên vui lòng dùng cổng học viên.` / `Email này thuộc tài khoản giáo viên. Vui lòng đăng nhập tại ứng dụng giáo viên.` | đổi cổng | `packages/auth/src/index.ts:466-479` | 🟡 (cụm UI sau cờ tắt — OQ-001) |
| E-SIGNIN-019 | quên mật khẩu (luôn) | `If an account exists for that email, we sent a reset link. It expires in 1 hour.` | kiểm tra thư | `apps/web/src/components/auth/forgot-password-form.tsx:13-14` | ✅ |
| E-SIGNIN-020 | 429 khi gửi link | `Too many requests. Wait a minute and try again.` | chờ 1 phút | `apps/web/src/components/auth/forgot-password-form.tsx:15,46-50` | ✅ |
| E-SIGNIN-021 | gửi link lỗi khác | `Couldn't send the reset email. Try again.` | thử lại | `apps/web/src/components/auth/forgot-password-form.tsx:16` | ✅ |
| E-SIGNIN-022/023/024 | link hỏng / đổi lỗi / mật khẩu lệch | `This reset link is invalid or has expired.` · `Couldn't update your password. Try again.` · `Passwords do not match` | link mới / thử lại / gõ lại | `apps/web/src/components/auth/reset-password-form.tsx:14-16,63-75` | ✅ |
| E-SIGNIN-025/026 | link xác thực hỏng / gửi lại lỗi | `This link didn't work` + `The verification link is invalid, already used, or has expired. Request a new one, or sign in and continue.` · `Couldn't send a new link. Try again.` | gửi lại | `apps/web/src/components/verify-email-view.tsx:96-102,123-127` · E2E `apps/e2e/specs/web-email-verification.spec.ts:61-72` | ✅ |
| E-SIGNIN-027 | gửi lại từ màn chặn lỗi | `Không thể gửi lại email xác thực. Vui lòng thử lại sau.` | thử lại | `apps/web/src/components/account-blocked-view.tsx:52-71` | ✅ |
| E-SIGNIN-028 | đường OTP sai cổng/vai | `Endpoint này không khả dụng.` | dùng cổng học viên | `packages/auth/src/index.ts:366-379` · test `packages/auth/src/auth-email-otp.test.ts:163-266` | ✅ |
| E-SIGNIN-029 | phiên hết hạn khi nạp vùng làm việc | `Phiên đăng nhập đã hết hạn.` | đăng nhập lại | `apps/web/src/lib/kernel-load-state.ts:87` | ✅ |
| E-SIGNIN-030 | lỗi đăng ký / mất phiên sau đăng ký | `Couldn't create your account. Check your connection and try again.` · `Your account is ready, but we couldn't start your session. Please sign in.` | thử lại / đăng nhập | `apps/web/src/components/sign-up-form.tsx:34-35,61-64` (chỉ render khi cờ BẬT — đang TẮT) | 🟡 (OQ-001) |

## §4. Business Rules (rule + hằng số + state transition)

| Rule | Trigger | Hằng số/ngưỡng | Có test phủ? | Nguồn (file:line) | Nhãn |
|------|---------|----------------|--------------|-------------------|------|
| Vai gán 1 lần theo cổng, client không ghi được | user.create.before | role student/teacher/admin; `input: false` | có (`packages/auth/src/role.test.ts`) | `packages/auth/src/index.ts:329-333,481-497` | ✅ |
| Không rõ cổng → học viên | resolveRequestApp | default student | có (`packages/auth/src/role.test.ts:105-133`) | `packages/auth/src/role.ts:60` | ✅ |
| Origin "null" không tin | matchOrigin | literal bỏ qua | có | `packages/auth/src/role.ts:20-27` | ✅ |
| Chặn tạo phiên khi vai lệch | session.create.before | 403 + câu VI; verify-email chéo vai → redirect `?error=ROLE_MISMATCH` | có (`packages/auth/src/auth-verify-email-role.test.ts:77-113`) | `packages/auth/src/index.ts:501-538` | ✅ |
| Gate kernel theo allowlist + verify | mỗi request teacher | TEACHER_EMAILS rỗng → bỏ gate; khác rỗng → bắt cả hai | có (`apps/server/src/role-gates.test.ts:321-393`) | `apps/server/src/app.ts:246-269` | ✅ |
| Gate admin mỗi request | requireAdmin | role admin ∧ verified ∧ trong ADMIN_EMAILS | có (`apps/server/src/lib/require-admin.test.ts`) | `apps/server/src/lib/require-admin.ts:27-51` | ✅ |
| Bootstrap tổ chức giáo viên | request teacher đầu tiên | tên tổ chức = tên user; vai thành viên teacher; earliest thắng | có (`apps/server/src/role-gates.test.ts:165-188`) | `apps/server/src/app.ts:278-291` | ✅ |
| Token đặt lại 1 giờ + thu hồi phiên | reset | 3600s; revoke=true | có (`packages/auth/src/auth-reset-password.test.ts:118-163`) | `packages/auth/src/index.ts:258-266` | ✅ |
| Phản hồi quên mật khẩu trung tính | forget | câu như nhau dù email có/không tồn tại | có (`packages/auth/src/auth-reset-password.test.ts:165-180`) | `packages/auth/src/index.ts:258-297` | ✅ |
| Không gửi thư chéo cổng sai vai | gửi thư | targetApp !== vai → skip | có (`packages/auth/src/auth-reset-password.test.ts:235-255`) | `packages/auth/src/index.ts` (kiểm trước gửi) | ✅ |
| Google trùng email → tạo credential khi đặt lại | reset | — | có (`packages/auth/src/auth-reset-password.test.ts:257-293`) | `packages/auth/src/index.ts:258-297` | ✅ |
| OTP 5 phút, băm, trễ 60s, chỉ học viên | email-otp | 300s; 60s | có (`packages/auth/src/auth-email-otp.test.ts:78-266`) | `packages/auth/src/index.ts:151-198,366-425,564-596` | ✅ |
| Giới hạn đặt lại 3/60s (nền) + UI trễ 60s | request-password-reset | 3/60s; UI 60s | không (chỉ comment + nhánh 429) | `apps/web/src/components/auth/forgot-password-form.tsx:15-19,46-50` | 🔵 |
| Cờ đăng ký TẮT mặc định | build | `VITE_TEACHER_SIGNUP_ENABLED === "true"` | có (`apps/web/src/routes/login-signup-gate.test.tsx:45-78`) | `apps/web/src/lib/features.ts:11-15` | 🟡 (quyết định bật lại — OQ-001) |
| Prod fail-closed allowlist giáo viên | triển khai | TEACHER_EMAILS bắt buộc | có (`packages/infra/src/topology.test.ts`) | `packages/infra/src/topology.ts:155-172` | ✅ |
| Cấm "coi như đã verify" trên prod | triển khai | flag bị cấm | có | `packages/infra/src/topology.ts:142-153` | ✅ |
| Xác thực email: tạo xong tự gửi; gửi lại báo to | sign-up / resend | hạn 1 giờ; tự đăng nhập sau verify | có (`packages/auth/src/auth-verification-email.test.ts:34-143`) | `packages/auth/src/index.ts:298-326` | ✅ |

## §5. Entities (đối tượng dữ liệu nghiệp vụ)

| Entity | Field nghiệp vụ chính | Quan hệ | Nguồn (file:line) |
|--------|-----------------------|---------|-------------------|
| user | email duy nhất, emailVerified (default false), role (default student), name, image | 1-n session, account, verification, membership | `packages/db/src/schema/auth.ts:4-28` |
| session | gắn user, hết hạn, IP/agent | n-1 user | `packages/db/src/schema/auth.ts:30-49` |
| account | providerId (credential/google), password | n-1 user | `packages/db/src/schema/auth.ts:51-79` |
| verification | giá trị băm (token/OTP), hạn | n-1 user (theo identifier) | `packages/db/src/schema/auth.ts:81-97` |
| organization | tên (= tên giáo viên đầu tiên) | 1-n membership | `apps/server/src/app.ts:278-291` |
| membership | role (default teacher), duy nhất (org,user) | n-1 organization, n-1 user | `packages/db/src/schema/membership.ts:22,28` |

## §6. Cross-repo hops (điểm nghiệp vụ → luồng liên quan)

| Điểm khởi phát | → tới đâu | Cơ chế (đọc/ghi/gọi) | Luồng nghiệp vụ liên quan | Nguồn 2 đầu (file:line) |
|----------------|-----------|----------------------|---------------------------|-------------------------|
| Web giáo viên `apps/web` | Biên auth `packages/auth` | gọi HTTP qua client auth | F1, F2, F3, F4 | `apps/web/src/lib/auth-client.ts:40-123` · `packages/auth/src/index.ts:248-333` |
| Hook callback OAuth | Gán vai + đóng dấu cổng | ghi user.role lúc tạo | F2 | `packages/auth/src/index.ts:335-364` · `packages/auth/src/role.ts:35-61` |
| API giáo viên `apps/server` | DB tổ chức/thành viên `packages/db` | ghi khi bootstrap | BR-011 | `apps/server/src/app.ts:278-291` · `packages/db/src/schema/membership.ts:22,28` |
| Màn bị chặn `apps/web` | gửi lại xác thực | gọi send-verification-email | F4/F5 | `apps/web/src/components/account-blocked-view.tsx:44-77` · `packages/auth/src/index.ts:298-326` |
| Console admin `apps/admin` | gate admin `apps/server` | header cookie → requireAdmin | SC-003 | `apps/server/src/lib/require-admin.ts:27-66` · `apps/e2e/specs/admin-auth.spec.ts:27-40` |
| Server gửi thư | Resend (ngoài) | HTTP + retry 1 lần | F3, F4, OTP | `packages/auth/src/mail/mailer.ts:103-122` · `apps/server/src/index.ts:41-59` |

## §7. Gaps / Ambiguities (code câm hoặc nghi ngờ)

* Không có E2E Google đăng nhập — (negative-search: grep "google" trong `apps/e2e/specs` → chỉ `apps/e2e/specs/profile.spec.ts:87,150`) · loại: test-skip → G-2, SC-005
* `apps/web/src/routes/register.tsx` không tồn tại dù được liệt kê trong kế hoạch — (negative-search: find register* trong `apps/web/src` → 0 kết quả; chỉ có `apps/admin/src/routes/register.tsx`) · loại: conflict → G-1, C-1
* Thời hạn phiên chưa cấu hình — (đọc `packages/auth/src/index.ts:540-563` không thấy session expiresIn) · loại: code-câm → G-3, OQ-002
* Câu lỗi gốc sai thông tin đăng nhập chưa pin catalog — (catalog chỉ có mã vai tại `packages/api/src/contracts.ts:1981-1996`) · loại: code-câm → G-4, OQ-003
* `ACCOUNT_ADMIN_ROLE` không nằm trong danh sách UI màn chặn — (`apps/web/src/lib/repos/kernel.ts:718-726`) · loại: dead-code-nghi → G-5
* Cờ đăng ký khi TẮT không còn ai tiêu thụ form đăng ký — (grep TEACHER_SIGNUP_ENABLED toàn repo → `apps/web/src/lib/features.ts:11-15`, `apps/web/src/routes/login.tsx:37`, `apps/e2e/playwright.config.ts:96`) · loại: dead-code-nghi (flag-off) → G-6, FR-018
* Giới hạn 3/60s của nền service chưa có test trực tiếp — (chỉ comment `apps/web/src/components/auth/forgot-password-form.tsx:18-19` + nhánh 429) · loại: test-skip → BR-010, I-2

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
