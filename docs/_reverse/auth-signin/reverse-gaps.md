---
type: reverse-gaps
feature: auth-signin
updated: 2026-11-11
---

# auth-signin — Khoảng trống, nghi vấn, xung đột, suy luận

## Open Questions (code "không nói" — không tự bịa)

| OQ | Câu hỏi | Vì sao code không trả lời được | Điểm liên quan |
|---|---|---|---|
| OQ-001 | Ai là "chủ tài khoản" duy nhất của trung tâm, và quy trình nào bật lại `TEACHER_SIGNUP_ENABLED` khi mở rộng nhiều tổ chức? | Cờ mặc định TẮT, không có tài liệu quy trình | `apps/web/src/lib/features.ts:11-15`, `docs/project-overview-pdr.md:21` |
| OQ-002 | Thời hạn phiên giáo viên kỳ vọng bao lâu? | Không thấy cấu hình session expiresIn trong khối cấu hình auth | `packages/auth/src/index.ts:540-563` |
| OQ-003 | Có cần chuẩn hóa câu thông báo "sai email/mật khẩu" sang tiếng Việt không? | Câu gốc do nền service sinh, không nằm trong catalog nội bộ; UI chỉ hiện câu chung | `apps/web/src/components/sign-in-form.tsx:32-33` |
| OQ-004 | Copy UI tiếng Anh còn thư tiếng Việt — chủ đích song ngữ hay chưa dịch? | Không có quyết định ghi lại | `apps/web/src/components/sign-in-form.tsx:32-33`, `packages/auth/src/mail/brand.ts` |
| OQ-005 | Quy trình thêm/bớt email allowlist khi vận hành (hiệu lực ngay hay cần phiên mới)? | Gate admin kiểm lại mỗi request nhưng quy trình vận hành không có trong code | `apps/server/src/lib/require-admin.ts:8-17` |
| OQ-006 | Giới hạn tần suất theo từng isolate Cloudflare Worker có đủ chống lạm dụng không? | Bộ đếm nằm trong bộ nhớ tiến trình, không có khóa chung | `packages/auth/src/index.ts:151-198`, `apps/web/src/components/auth/forgot-password-form.tsx:18-19` |
| OQ-007 | Giáo viên có cần đăng nhập OTP như học viên không? | OTP bị chặn với teacher/admin, không thấy lý do | `packages/auth/src/index.ts:380-425` |
| OQ-008 | Tài khoản Google trùng email với tài khoản mật khẩu: gộp hay hai tài khoản riêng? | Chỉ thấy hành vi tạo credential khi đặt lại mật khẩu, không thấy tuyên bố chính sách | `packages/auth/src/auth-reset-password.test.ts:257-293` |
| OQ-009 | Trang đăng ký console quản trị (`apps/admin/src/routes/register.tsx`) thuộc feature nào, có còn dùng không? | Ngoài phạm vi auth-signin, chưa đối chiếu | `apps/admin/src/routes/register.tsx` |

## Gaps (khoảng trống phát hiện khi đọc code)

| # | Khoảng trống | Chứng cứ tra ngược (negative-search) | Loại | Nhãn |
|---|---|---|---|---|
| G-1 | `apps/web/src/routes/register.tsx` được liệt kê trong kế hoạch nguồn nhưng KHÔNG tồn tại; đăng ký nằm trong tab của `/login` | tìm file `register*` trong `apps/web/src` → chỉ có form trong components | dead-code-nghi/deal-gap | 🟡 |
| G-2 | Không có E2E tự động cho luồng Google đăng nhập | tìm "google" trong `apps/e2e/specs` → chỉ `apps/e2e/specs/profile.spec.ts:87,150` (liên kết tài khoản, không phải đăng nhập) | test-skip | 🟡 |
| G-3 | Thời hạn phiên chưa cấu hình — dùng mặc định nền service | đọc khối cấu hình auth không thấy expiresIn session | code-câm | 🟡 |
| G-4 | Câu lỗi gốc "sai thông tin đăng nhập" của nền service chưa pin vào catalog nội bộ | catalog nội bộ chỉ có mã chặn vai `packages/api/src/contracts.ts:1981-1996` | code-câm | 🟡 |
| G-5 | Quản trị truy cập ứng dụng giáo viên: API chặn `ACCOUNT_ADMIN_ROLE` nhưng mã này KHÔNG nằm trong danh sách UI chuyển màn chặn → không thấy màn thân thiện, chỉ thấy lỗi truy vấn | `apps/web/src/lib/repos/kernel.ts:718-726` chỉ gộp STUDENT_ON_TEACHER_APP, TEACHER_NOT_ALLOWED, TEACHER_EMAIL_UNVERIFIED | dead-code-nghi | 🟡 |
| G-6 | Cờ `TEACHER_SIGNUP_ENABLED` khi TẮT: toàn bộ form đăng ký không render — chỉ còn tiêu thụ ở trang đăng nhập và cấu hình e2e | tìm "TEACHER_SIGNUP_ENABLED" toàn repo → `apps/web/src/lib/features.ts:11-15`, `apps/web/src/routes/login.tsx:37`, `apps/e2e/playwright.config.ts:96` | dead-code-nghi (flag-off) | 🟡 |
| C-1 | XUNG ĐỘT nguồn: đề bài liệt kê `apps/web/src/routes/register.tsx` làm nguồn; thực tế không tồn tại (chỉ `apps/admin/src/routes/register.tsx`). Tài liệu này theo code thật — đăng ký giáo viên = tab của `/login` | đối chiếu cây thư mục `apps/web/src/routes` | conflict | 🟡 |

## Inferred (suy luận có ≥2 chứng cứ code — không bịa)

| # | Suy luận | Chứng cứ 1 | Chứng cứ 2 | Nhãn |
|---|---|---|---|---|
| I-1 | Mặc định học viên là chủ đích "đặc quyền thấp nhất" | `packages/auth/src/role.ts:60` (default student) | `packages/auth/src/role.test.ts:105-133` (test least-privilege) | 🔵 |
| I-2 | Nền service giới hạn đặt lại mật khẩu 3 lần/60 giây | comment nêu rõ tại `apps/web/src/components/auth/forgot-password-form.tsx:18-19` | nhánh bắt mã 429 tại `apps/web/src/components/auth/forgot-password-form.tsx:46-50` | 🔵 |
| I-3 | OTP chỉ nhắm cổng học viên (UI OTP chỉ tồn tại ở apps/student) | chặn đường OTP teacher/admin `packages/auth/src/index.ts:366-425` | tìm OTP trong `apps/web/src` → không có màn hình OTP | 🔵 |
| I-4 | Cookie chéo sub-domain là lý do phải chặn vai ở 3 tầng | comment thiết kế `packages/api/src/contracts.ts:1975-1981` | comment `apps/server/src/app.ts:221-223` | 🔵 |

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
