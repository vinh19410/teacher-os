---
type: reverse-srs
feature: auth-signin
status: draft
updated: 2026-11-11
confidence_summary: "✅170 · 🔵11 · 🟡25 — OQ 9 (đếm trên toàn bộ 13 file của bộ tài liệu)"
links:
  sources: reverse-sources.md
  gaps: reverse-gaps.md
  evidence: _evidence.md
  flows: srs/auth-signin-reverse-flows.md
  states: srs/auth-signin-reverse-states.md
  erd: srs/auth-signin-reverse-erd.md
  usecases: usecases/auth-signin-reverse-usecase-index.md
---

# auth-signin — Đặc tả SRS tái lập (reverse)

## 0. Nguồn gốc tài liệu (provenance)

- Loại: reverse-srs — tái lập 100% từ code + test của repo `/root/projects/teacher-os` (không có tài liệu SRS cũ: `existing_doc: null` tại `docs/_reverse/reverse-plan.json:9`), nên bỏ qua bảng so sánh với tài liệu cũ.
- Bảng độ tin cậy nguồn dùng cho toàn bộ tài liệu:

| Loại nguồn | Cách dùng | Ví dụ |
|---|---|---|
| Code nghiệp vụ | Chứng cứ khẳng định hành vi (validator, hằng số, guard, câu lỗi) | `packages/auth/src/index.ts` |
| Unit/integration test | Xác nhận hành vi có test phủ (nhãn R1) | `packages/auth/src/role.test.ts` |
| E2E spec | Xác nhận câu chữ hiển thị đúng nguyên văn trên UI | `apps/e2e/specs/account-role-separation.spec.ts` |
| Schema DB | Đối tượng dữ liệu thật | `packages/db/src/schema/auth.ts` |
| Cấu hình hạ tầng | Ràng buộc môi trường prod | `packages/infra/src/topology.ts` |
| Quyết định dự án (PDR) | Bối cảnh quyết định đã chốt | `docs/project-overview-pdr.md:14,21,22` |

## 1. Phạm vi (Scope)

Trong phạm vi:
- Đăng nhập vào ứng dụng giáo viên bằng email/mật khẩu và bằng Google OAuth.
- Phân vai theo "cổng" (origin): học viên / giáo viên / quản trị và chặn chéo vai trò ở 3 tầng.
- Quên mật khẩu — đặt lại mật khẩu qua link email (1 giờ).
- Xác thực email khi tạo tài khoản, tự đăng nhập sau xác thực, gửi lại email xác thực.
- OTP email đăng nhập cho cổng học viên (đối chiếu ranh giới: teacher/admin bị chặn).
- Đăng ký giáo viên qua UI khi cờ tính năng bật (hiện TẮT mặc định) và cổng đăng ký API theo allowlist.
- Phiên làm việc: kiểm tra phiên, cache phía client, mất phiên thì quay lại đăng nhập.
- Màn hình bị chặn (blocked view) kèm gửi lại email xác thực.

Ngoài phạm vi (Boundary):
- Đăng ký/ provisions tài khoản học viên trên cổng học viên (feature `auth-student-signup`).
- Quản lý danh sách học viên, lời mời (`student-invitations`).
- Console quản trị sau khi đã đăng nhập (`admin-library`…).
- Cấu hình DNS/cookie domain hạ tầng (chỉ ghi ràng buộc).

## 2. Tác nhân (Actors)

| Actor | Mô tả | Cách hệ thống nhận biết | Nguồn | Nhãn |
|---|---|---|---|---|
| Giáo viên | Chủ tài khoản trung tâm, dùng ứng dụng giáo viên | Vai `teacher` gán theo origin khi tạo tài khoản | `packages/auth/src/role.ts:14-18`, `packages/db/src/schema/auth.ts` (cột role) | ✅ |
| Học viên | Người học, dùng cổng học viên | Vai `student` (mặc định khi tạo) | `packages/db/src/schema/auth.ts` (role default), `packages/auth/src/role.ts:60` | ✅ |
| Quản trị viên | Vận hành console quản trị | Vai `admin`, chỉ email trong danh sách allowlist admin | `apps/server/src/lib/require-admin.ts:8-17`, `packages/auth/src/index.ts:443-455` | ✅ |
| Khách chưa đăng nhập | Người truy cập các trang công khai | Chưa có phiên | `apps/web/src/routes/_auth/route.tsx:7-40` (đẩy về đăng nhập) | ✅ |
| Google | Nhà cung cấp định danh ngoài | OAuth 2.0, bắt buộc chọn tài khoản mỗi lần | `packages/auth/src/index.ts:248-257` | 🔵 |
| Dịch vụ gửi mail | Gửi thư đặt lại mật khẩu / xác thực / OTP | Qua nhà cung cấp Resend; thiếu khóa thì chỉ ghi log | `apps/server/src/index.ts:41-59`, `packages/auth/src/mail/mailer.ts:103-122` | 🔵 |

## 3. Yêu cầu chức năng (FR)

| ID | Tên | Điều kiện / nhánh | Độ ưu tiên | Verify by | Nguồn | Nhãn |
|---|---|---|---|---|---|---|
| FR-001 | Đăng nhập email/mật khẩu | Nhập email + mật khẩu → kiểm tra bắt buộc từng trường (thiếu mới báo, không kiểm độ dài mật khẩu khi đăng nhập); email được cắt khoảng trắng trước khi gửi | Cao | E2E `apps/e2e/specs/signin-validation.spec.ts:49-93` | `apps/web/src/lib/sign-in-schema.ts:3-17`, `apps/web/src/components/sign-in-form.tsx:40-44` | ✅ |
| FR-002 | Xử lý đăng nhập thất bại | Sai thông tin hoặc lỗi mạng → hiện đúng một câu thông báo chung, không tiết lộ trường nào sai | Cao | E2E `apps/e2e/specs/auth-fail-loudly.spec.ts:61-121` | `apps/web/src/components/sign-in-form.tsx:32-33,45-48` | ✅ |
| FR-003 | Kiểm tra phiên tầng 2 sau đăng nhập | API trả thành công nhưng chưa có phiên (mất cookie) → báo "mất phiên" thay vì "đăng nhập thất bại" | Cao | Code path riêng + E2E `apps/e2e/specs/auth-fail-loudly.spec.ts` | `apps/web/src/components/sign-in-form.tsx:49-62` | ✅ |
| FR-004 | Điều hướng sau đăng nhập | Chỉ nhận đường dẫn trong cùng ứng dụng (cấm mở ngoài, cấm "//", ký tự điều khiển); không có/không hợp lệ thì về trang tổng quan | Cao | Unit (schema thuần) | `apps/web/src/lib/kernel-load-state.ts:149,156-212`, `apps/web/src/components/sign-in-form.tsx:63-66` | ✅ |
| FR-005 | Đăng nhập Google | Nút Google → luồng OAuth; mỗi lần bắt buộc Google hỏi chọn tài khoản; quay về đúng origin đã gọi; lỗi OAuth về trang đăng nhập kèm mã lỗi trên URL | Cao | Unit (cấu hình provider) | `packages/auth/src/index.ts:248-257`, `apps/web/src/components/google-oauth-button.tsx:48,52` | ✅ |
| FR-006 | Phân loại "cổng" theo origin | Khi tạo tài khoản/khi callback OAuth, hệ thống phân loại origin học viên/giáo viên/quản trị theo danh sách khớp chính xác; origin "null" không tin; không nhận diện được → mặc định học viên | Cao | Unit `packages/auth/src/role.test.ts:105-133` | `packages/auth/src/role.ts:20-27,35-61` | ✅ |
| FR-007 | Gắn cổng vào trạng thái OAuth | Trước khi bắt đầu Google OAuth, server tự đóng dấu "cổng nào" vào trạng thái OAuth để callback (GET, không có Origin) vẫn phân loại đúng | Cao | Unit (hook) `apps/server/src/auth-role-roundtrip.test.ts` | `packages/auth/src/index.ts:335-364`, `packages/auth/src/role.ts:9` | ✅ |
| FR-008 | Chặn chéo vai trò — tầng tạo phiên | Khi tạo phiên, nếu vai không khớp cổng → từ chối 403 kèm câu tiếng Việt thân thiện, KHÔNG tạo phiên; riêng xác thực email chéo vai → chuyển hướng về trang đăng nhập kèm `error=ROLE_MISMATCH` thay vì lỗi thô | Cao | Unit `packages/auth/src/auth-verify-email-role.test.ts:77-113`, `apps/e2e/specs/account-role-separation.spec.ts:63-106` | `packages/auth/src/index.ts:92-99,501-538` | ✅ |
| FR-009 | Chặn chéo vai trò — tầng API giáo viên | Mọi request tới API giáo viên: học viên → 403 mã `ACCOUNT_STUDENT_ROLE` (không bootstrap tổ chức); quản trị → 403 mã `ACCOUNT_ADMIN_ROLE`; giáo viên ngoài allowlist → 403 `ACCOUNT_TEACHER_NOT_ALLOWED`; giáo viên chưa xác thực email → 403 `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` | Cao | Unit `apps/server/src/role-gates.test.ts:127-237,321-393` | `apps/server/src/app.ts:206-269` | ✅ |
| FR-010 | Chặn chéo vai trò — tầng cổng học viên | Session không phải học viên gọi API cổng học viên → 403 mã `ACCOUNT_TEACHER_ROLE`, không trả dữ liệu | Cao | Unit `apps/server/src/role-gates.test.ts:190-223` | `apps/server/src/routes/student.ts:497-516` | ✅ |
| FR-011 | Chặn chéo vai trò — tầng admin | Mọi API quản trị kiểm lại MỖI request: vai admin + email đã xác thực + email trong allowlist; sai bất kỳ → 403 mã `ACCOUNT_NOT_ADMIN`; gỡ email khỏi allowlist là mất quyền ngay | Cao | Unit `apps/server/src/lib/require-admin.test.ts` | `apps/server/src/lib/require-admin.ts:8-17,27-51` | ✅ |
| FR-012 | UI nhận biết bị chặn | Khi API trả các mã chặn vai (học viên trên app giáo viên, giáo viên chưa xác thực, ngoài allowlist) → thay toàn bộ vùng làm việc bằng màn hình bị chặn, đánh dấu một lần duy nhất chống lặp | Cao | Code + query handler | `apps/web/src/lib/query-client.ts:31-47`, `apps/web/src/lib/role-block.ts:12-22`, `apps/web/src/lib/data-provider.tsx:73-76,165-167` | ✅ |
| FR-013 | Màn hình bị chặn + tự chủ | Hai nhánh nội dung: (a) giáo viên chưa xác thực email — hiện email, nút gửi lại email xác thực, nút "tôi đã xác thực — kiểm tra lại", đã xác thực rồi thì tự tải lại; (b) còn lại — thông báo không có quyền và nút đăng xuất | Cao | Component test `apps/web/src/components/account-blocked-view.test.tsx:32-86` (cả hai nhánh) + E2E `apps/e2e/specs/account-role-separation.spec.ts:108-157` (chỉ nhánh student) | `apps/web/src/components/account-blocked-view.tsx:40-160` | ✅ |
| FR-014 | Quên mật khẩu | Nhập email → hệ thống luôn trả lời trung tính như nhau (kể cả email không tồn tại); link đặt lại có hạn 1 giờ; từ UI, gửi lại bị trễ 60 giây; mã 429 có câu báo riêng | Cao | Unit `packages/auth/src/auth-reset-password.test.ts:165-180` | `packages/auth/src/index.ts:258-297`, `apps/web/src/components/auth/forgot-password-form.tsx:13-19,46-50` | ✅ |
| FR-015 | Đặt lại mật khẩu | Link hợp lệ + mật khẩu mới (tối thiểu 8 ký tự, gõ lại khớp) → đổi mật khẩu, THU HỒI toàn bộ phiên cũ; link hỏng/hết hạn → kết thúc luồng, không cho thử trên cùng form; lỗi mạng/5xx → giữ token cho thử lại | Cao | Unit `packages/auth/src/auth-reset-password.test.ts:118-163` | `apps/web/src/components/auth/reset-password-form.tsx:14-29,42-45,60-75` | ✅ |
| FR-016 | Xác thực email khi tạo tài khoản | Tạo tài khoản → tự gửi thư xác thực (hạn 1 giờ); bấm link hợp lệ → đánh dấu đã xác thực + TỰ ĐĂNG NHẬP; chéo vai thì về trang đăng nhập kèm `ROLE_MISMATCH`; gửi thư lỗi trên đường tạo tài khoản thì KHÔNG chặn việc tạo (tha thứ), trên đường gửi lại thì báo lỗi rõ (báo to) | Cao | Unit `packages/auth/src/auth-verification-email.test.ts:34-143` | `packages/auth/src/index.ts:298-326`, `packages/auth/src/index.ts` (hook verify) | ✅ |
| FR-017 | OTP email cho học viên | Cổng học viên được đăng nhập bằng mã OTP gửi email: mã có hạn 5 phút, chỉ lưu bản băm, trễ 60 giây giữa các lần gửi, không gửi OTP cho email giáo viên/quản trị; teacher/admin gọi các đường OTP → 403 "câu chặn"; UI OTP chỉ tồn tại ở cổng học viên | Trung | Unit `packages/auth/src/auth-email-otp.test.ts:78-317` | `packages/auth/src/index.ts:151-198,366-425,564-596` | ✅ |
| FR-018 | Đăng ký UI giáo viên (cờ TẮT) | Cờ build `VITE_TEACHER_SIGNUP_ENABLED` khác "true" → trang đăng nhập chỉ còn tab đăng nhập, không render form đăng ký, tab lưu trong máy nếu là "đăng ký" bị bỏ qua; e2e bật cờ = true | Trung | Component test `apps/web/src/routes/login-signup-gate.test.tsx:45-78` | `apps/web/src/lib/features.ts:11-15`, `apps/web/src/routes/login.tsx:36-47`, `apps/e2e/playwright.config.ts:96` | 🟡 |
| FR-019 | Cổng đăng ký API theo allowlist | Tạo tài khoản (mật khẩu lẫn Google): origin quản trị chỉ cho email trong allowlist admin; origin giáo viên chỉ cho email trong allowlist giáo viên; và ngược lại email giáo viên đăng ký từ cổng khác bị chặn để tránh nhiễm vai học viên | Cao | Unit `packages/auth/src/auth-teacher-signup.test.ts:68-118`, `packages/auth/src/auth-admin-signup.test.ts:74-110` | `packages/auth/src/index.ts:440-480` | ✅ |
| FR-020 | Gán vai lúc tạo tài khoản | Vai gán MỘT lần lúc tạo, theo cổng đã phân loại; client không thể tự ghi vai qua API | Cao | Unit `packages/auth/src/role.test.ts` | `packages/auth/src/index.ts:329-333,481-497` | ✅ |
| FR-021 | Tổ chức cho giáo viên đầu tiên | Request đầu tiên của giáo viên khi chưa có tổ chức → tự tạo tổ chức (tên = tên người dùng) + tư cách thành viên vai "teacher"; tranh chấp đồng thời thì tổ chức tạo sớm nhất thắng (chưa có test phủ trực tiếp cho nhánh tranh chấp — chỉ comment `apps/server/src/app.ts:289`) | Cao | Unit `apps/server/src/role-gates.test.ts:165-188` (phủ bootstrap chính) | `apps/server/src/app.ts:278-291`, `packages/db/src/schema/membership.ts:22,28` | ✅ |
| FR-022 | Phiên phía client | Ứng dụng đọc phiên có cache 10 giây, gộp các lần gọi đồng thời, timeout 5 giây, giữ "phiên gần nhất" khi mạng lỗi để không nhấp nháy đăng xuất | Cao | Code | `apps/web/src/lib/auth-client.ts:40,64-123` | ✅ |
| FR-023 | Mất phiên → về đăng nhập | Khi API trả 401 → đăng xuất sạch (một lần duy nhất dù nhiều request cùng lỗi) và chuyển tới trang đăng nhập kèm `returnUrl` | Cao | Code + query handler | `apps/web/src/lib/reauth.ts:25-33`, `apps/web/src/lib/query-client.ts:31-47` | ✅ |
| FR-024 | Gửi mail + dự phòng | Gửi thư qua Resend, thử lại 1 lần khi lỗi 429/5xx; thiếu khóa cấu hình thì chuyển chế độ chỉ ghi log kèm cảnh báo; giữ phiên gọi mail chạy nền cho nhanh | Trung | Unit `packages/auth/src/auth-reset-password.test.ts:182-233` | `apps/server/src/index.ts:41-59`, `packages/auth/src/mail/mailer.ts:103-122` | ✅ |

## 4. Yêu cầu phi chức năng (NFR)

| ID | Loại | Yêu cầu | Đo/kiểm chứng | Nguồn | Nhãn |
|---|---|---|---|---|---|
| NFR-001 | Bảo mật | Vai không thể bị client ghi qua API (khóa input khi khai báo trường) | Khai báo schema | `packages/auth/src/index.ts:329-333` | ✅ |
| NFR-002 | Hiệu năng | Việc gửi thư đặt lại mật khẩu chạy nền, không giữ request quá 150ms | Test thời gian | `packages/auth/src/auth-reset-password.test.ts:209-233` | ✅ |
| NFR-003 | Riêng tư | Log khi gửi thư thất bại KHÔNG chứa token đặt lại hay địa chỉ email | Test nội dung log | `packages/auth/src/auth-reset-password.test.ts:182-207` | ✅ |
| NFR-004 | Riêng tư | Phản hồi quên mật khẩu trung tính, chống dò email tồn tại | Test phản hồi như nhau | `packages/auth/src/auth-reset-password.test.ts:165-180` | ✅ |
| NFR-005 | Trải nghiệm | Đọc phiên client có timeout 5 giây và dự liệu "phiên gần nhất" 5 giây khi lỗi | Code | `apps/web/src/lib/auth-client.ts:64-123` | ✅ |
| NFR-006 | Giới hạn tần suất | OTP: trễ 60 giây giữa 2 lần gửi mỗi email (bảng verification) | Test | `packages/auth/src/index.ts:151-198`, `packages/auth/src/auth-email-otp.test.ts:136-161` | ✅ |
| NFR-007 | Giới hạn tần suất | Đặt lại mật khẩu giới hạn 3 lần/60 giây ở nền service; UI tự trễ 60 giây để bù | Comment code + xử lý 429 | `apps/web/src/components/auth/forgot-password-form.tsx:18-19,46-50` | 🔵 |
| NFR-008 | Bảo mật vận chuyển | Bật HSTS, chuyển hướng HTTPS, CORS cho phép gửi cookie | Code + test | `apps/server/src/app.ts:343-391`, `apps/server/src/security.test.ts:29-104` | ✅ |
| NFR-009 | Bảo mật phiên | Cookie: httpOnly, secure, sameSite theo môi trường; tiền tố cookie chỉ chứa ký tự thường-số-gạch; domain cookie chéo sub-domain phải có dấu chấm đầu | Code + test | `packages/auth/src/index.ts:540-563`, `packages/auth/src/topology.ts:29-50,60-71` | ✅ |
| NFR-010 | Ngôn ngữ | Copy UI tiếng Anh (toast/form) trong khi thư email tiếng Việt — song ngữ không thống nhất | So sánh copy hai lớp | `apps/web/src/components/sign-in-form.tsx:32-33`, `packages/auth/src/mail/brand.ts` | 🟡 |

## 5. Quy tắc nghiệp vụ (BR)

| ID | Quy tắc | Điều kiện kích hoạt | Hằng số / ngưỡng | Test phủ | Nguồn | Nhãn |
|---|---|---|---|---|---|---|
| BR-001 | Vai gán một lần lúc tạo tài khoản, theo cổng (origin) của request | user.create.before | role: student/teacher/admin; không ghi được từ client | Có (`packages/auth/src/role.test.ts`) | `packages/auth/src/index.ts:481-497`, `packages/db/src/schema/auth.ts` (default student) | ✅ |
| BR-002 | Không nhận diện được cổng → mặc định học viên (đặc quyền thấp nhất) | resolveRequestApp không khớp danh sách nào | default = student | Có (`packages/auth/src/role.test.ts:105-133`) | `packages/auth/src/role.ts:60` | ✅ |
| BR-003 | Origin bằng chữ "null" không được tin là học viên | tab ẩn/Iframe không origin | literal "null" bị bỏ qua → đi tiếp nhánh khác | Có | `packages/auth/src/role.ts:20-27` | ✅ |
| BR-004 | Ứng dụng giáo viên yêu cầu vai teacher VÀ email đã xác thực (khi allowlist khác rỗng) | mỗi request kernel | emailVerified === true | Có (`apps/server/src/role-gates.test.ts:321-393`) | `apps/server/src/app.ts:246-269` | ✅ |
| BR-005 | Danh sách admin rỗng = KHÔNG ai là quản trị viên | cấu hình môi trường | ADMIN_EMAILS rỗng → gate luôn chặn | Có (`apps/server/src/lib/require-admin.test.ts`) | `apps/server/src/lib/require-admin.ts:27-51` | ✅ |
| BR-006 | TEACHER_EMAILS bắt buộc khác rỗng trên prod — cấu hình thiếu là không cho triển khai | triển khai prod | fail-closed | Có (`packages/infra/src/topology.test.ts`) | `packages/infra/src/topology.ts:155-172` | ✅ |
| BR-007 | Cờ "coi như đã xác thực email" bị CẤM trên prod | triển khai prod | AUTH_ASSUME_EMAIL_VERIFIED fail-closed | Có | `packages/infra/src/topology.ts:142-153`, `apps/server/src/index.ts:102-107` | ✅ |
| BR-008 | Link đặt lại mật khẩu hạn 1 giờ; đổi mật khẩu xong thu hồi mọi phiên | forget/reset password | resetPasswordTokenExpiresIn = 3600s; revokeSessionsOnPasswordReset = true | Có (`packages/auth/src/auth-reset-password.test.ts:118-163`) | `packages/auth/src/index.ts:258-266` | ✅ |
| BR-009 | OTP: hạn 5 phút, lưu băm, trễ 60 giây, chỉ học viên | sign-in/email-otp | expiresIn 300s; cooldown 60s | Có (`packages/auth/src/auth-email-otp.test.ts`) | `packages/auth/src/index.ts:151-198,366-425,564-596` | ✅ |
| BR-010 | Nền service giới hạn đặt lại mật khẩu 3 lần/60 giây; UI tự trễ 60 giây và bắt mã 429 | request-password-reset | 3 yêu cầu / 60 giây (nền better-auth); UI 60s | Không (chỉ comment + nhánh 429) | `apps/web/src/components/auth/forgot-password-form.tsx:15-19,46-50` | 🔵 |
| BR-011 | Mô hình một tổ chức (#539/#513): tổ chức đầu tiên của giáo viên tự sinh, tên = tên người dùng, thành viên đầu vai teacher | request giáo viên đầu tiên | earliest org thắng khi tranh chấp | Có (`apps/server/src/role-gates.test.ts:165-188`) | `apps/server/src/app.ts:278-291` | ✅ |
| BR-012 | Tài khoản Google trùng email có tài khoản mật khẩu: đặt lại mật khẩu sẽ TẠO credential mật khẩu cho tài khoản đó | reset khi chỉ có tài khoản Google | — | Có (`packages/auth/src/auth-reset-password.test.ts:257-293`) | `packages/auth/src/index.ts:258-297` | ✅ |
| BR-013 | Không gửi THƯ ĐẶT LẠI MẬT KHẨU chéo cổng sai vai (targetApp khác vai người nhận → bỏ gửi, response vẫn trung tính); thư xác thực không có gate tương tự — chéo vai bị chặn ở tầng tạo phiên (501-538) | sendResetPassword | targetApp !== resolveUserRole → skip | Có (`packages/auth/src/auth-reset-password.test.ts:235-255`) | `packages/auth/src/index.ts:280` (kiểm tra trước khi gửi) | ✅ |
| BR-014 | Cờ đăng ký giáo viên mặc định TẮT cho tới khi có quyết định mới (#539 một tổ chức) | build frontend | VITE_TEACHER_SIGNUP_ENABLED === "true" mới bật | Có (`apps/web/src/routes/login-signup-gate.test.tsx:45-78`) | `apps/web/src/lib/features.ts:11-15`, `docs/project-overview-pdr.md:21` | 🟡 (quyết định bật lại là business-intent — OQ-001) |

## 6. Ma trận lỗi (Error Matrix) — câu chữ THẬT từ code/test

| ID | Tình huống | Câu chữ hiển thị (nguyên văn) | Phục hồi | Nguồn (nơi phát sinh + nơi hiện thị) | Nhãn |
|---|---|---|---|---|---|
| E-SIGNIN-001 | Bỏ trống email khi đăng nhập | `Email is required` | Nhập lại email | `apps/web/src/lib/sign-in-schema.ts:3,15` | ✅ |
| E-SIGNIN-002 | Bỏ trống mật khẩu khi đăng nhập | `Password is required` | Nhập lại mật khẩu | `apps/web/src/lib/sign-in-schema.ts:5,16` | ✅ |
| E-SIGNIN-003 | Email sai định dạng | `Invalid email address` | Sửa email | `apps/web/src/lib/sign-in-schema.ts:4,15` | ✅ |
| E-SIGNIN-004 | Sai email/mật khẩu (server từ chối) | `Couldn't sign you in. Check your email and password, then try again.` (toast chung; câu gốc của nền service không lộ cho người dùng) | Thử lại | UI `apps/web/src/components/sign-in-form.tsx:32-33,45-48`; nền service không pin trong catalog nội bộ | ✅ |
| E-SIGNIN-005 | API báo thành công nhưng không có phiên (mất cookie) | `We couldn't start your session. Please try signing in again.` | Đăng nhập lại | `apps/web/src/components/sign-in-form.tsx:49-62`; E2E `apps/e2e/specs/auth-fail-loudly.spec.ts` | ✅ |
| E-SIGNIN-006 | Học viên đăng nhập vào trang giáo viên | `Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên.` | Sang cổng học viên | Phát sinh `packages/auth/src/index.ts:92-93`; E2E nguyên văn `apps/e2e/specs/account-role-separation.spec.ts:89` | ✅ |
| E-SIGNIN-007 | Giáo viên đăng nhập vào cổng học viên | `Tài khoản giáo viên không thể đăng nhập vào cổng học viên.` | Dùng ứng dụng giáo viên | Phát sinh `packages/auth/src/index.ts:95-96` | ✅ |
| E-SIGNIN-008 | Vai không phải admin vào cổng quản trị | `Tài khoản này không được phép đăng nhập vào cổng quản trị.` | Dùng cổng đúng vai | Phát sinh `packages/auth/src/index.ts:98-99`; E2E `apps/e2e/specs/admin-auth.spec.ts:40` | ✅ |
| E-SIGNIN-009 | Nút Google thất bại / callback kèm mã lỗi lạ | `Đăng nhập Google thất bại. Vui lòng thử lại.` (chỉ mã ROLE_MISMATCH mới được hiện câu mô tả từ server; câu mô tả tự chế trên URL không được tin) | Thử lại | Câu tiếng Việt: `apps/web/src/routes/login.tsx:55-59`; nút Google lỗi trực tiếp thì hiện `error.message` thô: `apps/web/src/components/google-oauth-button.tsx:55-58` | ✅ |
| E-SIGNIN-010 | Học viên đã có phiên gọi API giáo viên (tầng bootstrap) | 403 mã máy `ACCOUNT_STUDENT_ROLE`; UI thay bằng màn chặn, tiêu đề `Đây là tài khoản học viên` | Đăng xuất / sang cổng học viên | `apps/server/src/app.ts:224-232`; `apps/web/src/components/account-blocked-view.tsx:88-90`; catalog `packages/api/src/contracts.ts:1982` | ✅ |
| E-SIGNIN-011 | Quản trị gọi API kernel giáo viên (tầng bootstrap) | 403 mã máy `ACCOUNT_ADMIN_ROLE` (không thuộc nhóm mã UI chuyển màn chặn — xem G-5) | Dùng console quản trị | `apps/server/src/app.ts:235-243`; catalog `packages/api/src/contracts.ts:1985` | ✅ |
| E-SIGNIN-012 | Giáo viên có phiên nhưng email ngoài allowlist | 403 mã máy `ACCOUNT_TEACHER_NOT_ALLOWED`; UI: `Tài khoản này không có quyền dùng ứng dụng giáo viên (thuộc cổng học viên hoặc email chưa nằm trong danh sách được phép). Vui lòng đăng xuất để tiếp tục.` | Liên hệ chủ tài khoản / đăng xuất | `apps/server/src/app.ts:246-257`; `apps/web/src/components/account-blocked-view.tsx:97-103`; catalog `packages/api/src/contracts.ts:1993` | ✅ |
| E-SIGNIN-013 | Giáo viên trong allowlist nhưng chưa xác thực email | 403 mã máy `ACCOUNT_TEACHER_EMAIL_UNVERIFIED`; UI: `Email giáo viên ({email}) chưa được xác thực. Vui lòng mở hộp thư và bấm liên kết xác thực trước khi truy cập ứng dụng, hoặc gửi lại email xác thực bên dưới.` | Bấm link trong thư hoặc gửi lại | `apps/server/src/app.ts:258-269`; `apps/web/src/components/account-blocked-view.tsx:91-96`; catalog `packages/api/src/contracts.ts:1995` | ✅ |
| E-SIGNIN-014 | Giáo viên/quản trị gọi API cổng học viên | 403 mã máy `ACCOUNT_TEACHER_ROLE` | Dùng cổng đúng vai | `apps/server/src/routes/student.ts:500-516`; catalog `packages/api/src/contracts.ts:1983` | ✅ |
| E-SIGNIN-015 | Session không thỏa cổng quản trị (vai/verify/allowlist) | 403 mã máy `ACCOUNT_NOT_ADMIN`; toast admin: `Tài khoản của bạn không có quyền quản trị.` | Đăng nhập bằng email admin | `apps/server/src/lib/require-admin.ts:38-45`; toast `apps/admin/src/lib/auth-error.ts:44` (test `apps/admin/src/lib/auth-error.test.ts:40`); E2E assert 403 `apps/e2e/specs/admin-auth.spec.ts:77-109` | ✅ |
| E-SIGNIN-016 | Tự tạo tài khoản từ origin quản trị, email ngoài allowlist | `Email này không được cấp quyền quản trị. Vui lòng dùng cổng học viên hoặc liên hệ quản trị viên.` | Dùng cổng học viên / liên hệ quản trị | Phát sinh `packages/auth/src/index.ts:449-454` | ✅ |
| E-SIGNIN-017 | Đăng ký tại ứng dụng giáo viên với email ngoài allowlist giáo viên | `Ứng dụng giáo viên hiện chỉ dành cho chủ tài khoản. Học viên vui lòng dùng cổng học viên.` | Học viên dùng cổng học viên | Phát sinh `packages/auth/src/index.ts:466-472` (test `packages/auth/src/auth-teacher-signup.test.ts:69`); UI đăng ký đang TẮT nên câu này chưa tới được người dùng trên app giáo viên — R3 | 🟡 (OQ-001) |
| E-SIGNIN-018 | Đăng ký email giáo viên từ cổng học viên/quản trị | `Email này thuộc tài khoản giáo viên. Vui lòng đăng nhập tại ứng dụng giáo viên.` | Về ứng dụng giáo viên | Phát sinh `packages/auth/src/index.ts:473-479` (test `packages/auth/src/auth-teacher-signup.test.ts:109`); câu chỉ xuất hiện khi có đường đăng ký ở cổng đó (app giáo viên đang TẮT) — R3 | 🟡 (OQ-001) |
| E-SIGNIN-019 | Gửi yêu cầu quên mật khẩu (mọi trường hợp) | `If an account exists for that email, we sent a reset link. It expires in 1 hour.` | Kiểm tra hộp thư | `apps/web/src/components/auth/forgot-password-form.tsx:13-14` | ✅ |
| E-SIGNIN-020 | Gửi quá 3 lần/60 giây (429) | `Too many requests. Wait a minute and try again.` | Chờ 1 phút | `apps/web/src/components/auth/forgot-password-form.tsx:15,46-50` | ✅ |
| E-SIGNIN-021 | Gửi thư đặt lại thất bại (lỗi khác) | `Couldn't send the reset email. Try again.` | Thử lại | `apps/web/src/components/auth/forgot-password-form.tsx:16` | ✅ |
| E-SIGNIN-022 | Link đặt lại mật khẩu hỏng/hết hạn/đã dùng | `This reset link is invalid or has expired.` | Yêu cầu link mới | `apps/web/src/components/auth/reset-password-form.tsx:14,63-72` | ✅ |
| E-SIGNIN-023 | Đổi mật khẩu lỗi (mạng/5xx/429) | `Couldn't update your password. Try again.` (giữ token, cho thử lại trên cùng form) | Thử lại | `apps/web/src/components/auth/reset-password-form.tsx:15,63-75` | ✅ |
| E-SIGNIN-024 | Hai ô mật khẩu mới không khớp | `Passwords do not match` | Gõ lại | `apps/web/src/components/auth/reset-password-form.tsx:16,25-28` | ✅ |
| E-SIGNIN-025 | Link xác thực email hỏng/đã dùng/hết hạn | Tiêu đề `This link didn't work`; nội dung `The verification link is invalid, already used, or has expired. Request a new one, or sign in and continue.` | Gửi lại link hoặc đăng nhập | `apps/web/src/components/verify-email-view.tsx:96-102`; E2E `apps/e2e/specs/web-email-verification.spec.ts:61-72` | ✅ |
| E-SIGNIN-026 | Gửi lại link xác thực thất bại | `Couldn't send a new link. Try again.` | Thử lại | `apps/web/src/components/verify-email-view.tsx:123-127` | ✅ |
| E-SIGNIN-027 | Gửi lại xác thực từ màn chặn thất bại | `Không thể gửi lại email xác thực. Vui lòng thử lại sau.` (đã xác thực rồi → tự tải lại trang) | Thử lại / tải lại | `apps/web/src/components/account-blocked-view.tsx:52-71` | ✅ |
| E-SIGNIN-028 | Đường OTP bị chặn theo cổng/vai | `Endpoint này không khả dụng.` | Dùng cổng học viên | Phát sinh `packages/auth/src/index.ts:366-379`; Unit `packages/auth/src/auth-email-otp.test.ts:163-266` | ✅ |
| E-SIGNIN-029 | Phiên hết hạn khi khởi động vùng làm việc | `Phiên đăng nhập đã hết hạn.` | Đăng nhập lại | `apps/web/src/lib/kernel-load-state.ts:87` | ✅ |
| E-SIGNIN-030 | Lỗi khác khi gửi form đăng ký (cờ bật) | `Couldn't create your account. Check your connection and try again.`; nếu tạo xong mà mất phiên: `Your account is ready, but we couldn't start your session. Please sign in.` | Thử lại / đăng nhập | `apps/web/src/components/sign-up-form.tsx:34-35,61-64` (chỉ render khi cờ đăng ký BẬT — đang TẮT) — R3 | 🟡 (OQ-001) |

## 7. Tiêu chí chấp nhận (Success Criteria)

| ID | Tiêu chí | Chứng cứ | Nguồn | Nhãn |
|---|---|---|---|---|
| SC-001 | Giáo viên đăng nhập email/mật khẩu hợp lệ → vào được vùng làm việc (redirect đúng) | E2E smoke `apps/e2e/specs/login.smoke.spec.ts:10-15` chỉ đi sign-UP qua API → /dashboard (chứng minh cookie phiên chéo origin vào được workspace); CHƯA có E2E đi đúng form đăng nhập happy-path | 🟡 |
| SC-002 | Học viên đăng nhập trang giáo viên → chặn đúng câu tiếng Việt nguyên văn, KHÔNG tạo phiên, KHÔNG sinh tổ chức | E2E tách vai | `apps/e2e/specs/account-role-separation.spec.ts:63-157` | ✅ |
| SC-003 | Quản trị qua đủ các cổng: vào được shell admin, bị chặn đúng mã khi thiếu điều kiện | E2E admin | `apps/e2e/specs/admin-auth.spec.ts:58-206` | ✅ |
| SC-004 | Đặt lại mật khẩu hết vòng đời: đổi được, thu hồi phiên, phản hồi trung tính, thư chạy nền | Unit trọn luồng | `packages/auth/src/auth-reset-password.test.ts:118-255` | ✅ |
| SC-005 | Đăng nhập Google hoạt động trọn vẹn trên môi trường thật (select_account, callback đúng cổng) | Chưa có E2E tự động (tìm "google" trong toàn bộ specs chỉ thấy bài kiểm tra liên kết tài khoản ở `apps/e2e/specs/profile.spec.ts:87,150`) | negative-search | 🟡 |

## 8. Đối tượng dữ liệu (tóm tắt)

| Đối tượng | Ý nghĩa nghiệp vụ | Thuộc tính chính | Nguồn | Nhãn |
|---|---|---|---|---|
| Người dùng (user) | Tài khoản đăng nhập chung mọi cổng | email (duy nhất), đã xác thực email, vai (mặc định học viên), tên, ảnh | `packages/db/src/schema/auth.ts:4-28` | ✅ |
| Phiên (session) | Đăng nhập đang hiệu lực | gắn người dùng, thời hạn, địa chỉ IP/agent | `packages/db/src/schema/auth.ts:30-49` | ✅ |
| Tài khoản liên kết (account) | Nguồn định danh: mật khẩu hoặc Google | providerId, mật khẩu (nếu có) | `packages/db/src/schema/auth.ts:51-79` | ✅ |
| Xác thực (verification) | Token đặt lại mật khẩu / xác thực email / OTP (lưu băm) | giá trị băm, hạn | `packages/db/src/schema/auth.ts:81-97` | ✅ |
| Tổ chức (organization) | Trung tâm trong mô hình một tổ chức | tên (= tên giáo viên đầu tiên) | `apps/server/src/app.ts:278-291` | ✅ |
| Thành viên (membership) | Tư cách người dùng trong tổ chức | vai thành viên (mặc định teacher), duy nhất theo (tổ chức, người dùng) | `packages/db/src/schema/membership.ts:22,28` | ✅ |

## 9. Luồng nghiệp vụ (tóm tắt — chi tiết tại `srs/auth-signin-reverse-flows.md`)

| Luồng | Tóm tắt | Nguồn chính | Nhãn |
|---|---|---|---|
| F1 Đăng nhập email/mật khẩu | Kiểm bắt buộc → gọi đăng nhập → kiểm phiên tầng 2 → điều hướng an toàn | `apps/web/src/components/sign-in-form.tsx:32-66` | ✅ |
| F2 Đăng nhập Google OAuth | Đóng dấu cổng vào state → Google (chọn tài khoản) → callback gán vai → tạo phiên, chéo vai bị chặn câu thân thiện | `packages/auth/src/index.ts:248-257,335-364,501-538` | ✅ |
| F3 Quên/đặt lại mật khẩu | Phản hồi trung tính → link 1 giờ → đặt lại (tối thiểu 8 ký tự) → thu hồi phiên | `packages/auth/src/index.ts:258-297` | ✅ |
| F4 Xác thực email | Gửi khi tạo tài khoản (tha thứ) → bấm link → tự đăng nhập; chéo vai → về đăng nhập kèm ROLE_MISMATCH | `packages/auth/src/index.ts:298-326,501-538` | ✅ |
| F5 Chặn chéo vai trò học viên → trang giáo viên | 3 tầng: chặn tạo phiên → chặn API → UI màn chặn kèm gửi lại xác thực | `apps/server/src/app.ts:206-269`, `apps/web/src/components/account-blocked-view.tsx` | ✅ |

## 10. Màn hình (Screens)

| Màn | Nội dung chính | Nguồn | Nhãn |
|---|---|---|---|
| Trang đăng nhập giáo viên `/login` | Form email/mật khẩu; nút Google; ghi nhớ tab trong máy; xử lý `returnUrl`, `error` | `apps/web/src/routes/login.tsx:20-129` | ✅ |
| Tab đăng ký (chỉ khi cờ bật — hiện TẮT) | Form tên/email/mật khẩu, tối thiểu 8 ký tự | `apps/web/src/components/sign-up-form.tsx`, `apps/web/src/lib/sign-up-schema.ts:5-17` | 🟡 (cụm UI sau cờ tắt — OQ-001) |
| Quên mật khẩu `/forgot-password` | Nhập email, thông báo trung tính, trễ gửi lại 60s | `apps/web/src/routes/forgot-password.tsx`, `apps/web/src/components/auth/forgot-password-form.tsx` | ✅ |
| Đặt lại mật khẩu `/reset-password` | Mật khẩu mới + gõ lại; token không nằm lại URL | `apps/web/src/routes/reset-password.tsx`, `apps/web/src/components/auth/reset-password-form.tsx:42-45` | ✅ |
| Xác thực email `/verify-email` | Kết quả xác thực; gửi lại link; đã xác thực thì vào làm việc | `apps/web/src/routes/verify-email.tsx`, `apps/web/src/components/verify-email-view.tsx` | ✅ |
| Màn bị chặn trong vùng làm việc | Tiêu đề "Đây là tài khoản học viên"; 2 nhánh nội dung; gửi lại xác thực; đăng xuất | `apps/web/src/components/account-blocked-view.tsx:85-160` | ✅ |
| Trang đăng nhập cổng học viên | Đích điều hướng khi bị chặn vai học viên (nội dung thuộc feature `auth-student-signup`) | `apps/student/src/routes/login.tsx` | ✅ |
| Trang đăng nhập console quản trị | Đích khi gate admin từ chối, nhận mã lỗi trên URL | `apps/admin/src/routes` (gate `apps/admin/src/lib/auth-error.ts` theo chú thích `apps/server/src/lib/require-admin.ts:53-60`) | ✅ |

## 11. Ràng buộc, phụ thuộc, giả định

Ràng buộc:
- Cookie dùng chung chéo sub-domain giữa các cổng → bắt buộc chặn vai ở nhiều tầng, không chỉ ở form đăng nhập (`packages/api/src/contracts.ts:1975-1981`, `apps/server/src/app.ts:221-223`).
- Prod fail-closed: thiếu TEACHER_EMAILS không cho triển khai; cờ "coi như đã xác thực" bị cấm (`packages/infra/src/topology.ts:142-172`).
- Cờ tính năng là hằng số lúc build, không có bảng bật/tắt runtime (`docs/project-overview-pdr.md:21`).
- Better-Auth là biên đăng nhập duy nhất, mount tại `/api/auth/*` (`docs/project-overview-pdr.md:22`, `apps/server/src/app.ts:406-407`).

Phụ thuộc:
- Google OAuth (client id/secret), Resend (khóa API) — thiếu Resend thì chỉ ghi log (`apps/server/src/index.ts:41-59`).
- Danh sách allowlist giáo viên/quản trị từ cấu hình môi trường, so khớp chữ thường (`apps/server/src/index.ts:66-97`).

Giả định (cần xác nhận — xem `reverse-gaps.md`):
- Mô hình một tổ chức giữ nguyên cho tới khi có quyết định mở rộng (OQ-001).
- Thời hạn phiên chưa cấu hình riêng — dùng mặc định của nền service (OQ-002).

## 12. Câu hỏi mở (Open Questions) — chi tiết tại `reverse-gaps.md`

OQ-001 chủ tài khoản duy nhất & quy trình bật lại đăng ký; OQ-002 thời hạn phiên; OQ-003 chuẩn hóa câu lỗi sai thông tin đăng nhập; OQ-004 chủ đích song ngữ copy; OQ-005 vận hành allowlist runtime; OQ-006 giới hạn tần suất theo isolate; OQ-007 OTP cho giáo viên?; OQ-008 chính sách Google trùng email; OQ-009 scope trang đăng ký console quản trị.

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
