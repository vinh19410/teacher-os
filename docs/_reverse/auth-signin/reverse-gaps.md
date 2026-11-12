---
type: reverse-gaps
feature: auth-signin
updated: 2026-11-12
---

# auth-signin — Khoảng trống, nghi vấn, xung đột, suy luận

Trạng thái: **Resolved** (đã có câu trả lời), **Accepted-gap** (khoảng trống được chấp nhận, không xử lý), **Open** (còn tồn tại, ghi backlog).
Nguồn "tài liệu Better Auth" bên dưới là tra cứu docs và source GitHub tại tag `v1.7.16` (phiên bản repo pin), chưa đối chiếu trực tiếp với `node_modules`.

## Open Questions (code "không nói" — không tự bịa)

| OQ | Câu hỏi | Trạng thái | Kết luận | Nguồn quyết định |
|---|---|---|---|---|
| OQ-001 | Ai là "chủ tài khoản" duy nhất của trung tâm, và quy trình nào bật lại `TEACHER_SIGNUP_ENABLED` khi mở rộng nhiều tổ chức? | Resolved | Chủ tài khoản duy nhất = chủ dự án trong giai đoạn single-org. Quy trình bật lại: đặt biến build `VITE_TEACHER_SIGNUP_ENABLED=true` rồi build lại web (mô tả trong `AGENTS.md`, mục "Lưu ý vận hành"). Server vẫn chặn theo allowlist `TEACHER_EMAILS`. | Quyết định 2026-11-12; `apps/web/src/lib/features.ts:11-15`, `AGENTS.md` |
| OQ-002 | Thời hạn phiên giáo viên kỳ vọng bao lâu? | Resolved | Chấp nhận mặc định của thư viện, chưa cần cấu hình. Theo tài liệu Better Auth: `expiresIn` mặc định 7 ngày, `updateAge` mặc định 1 ngày (phiên tự gia hạn khi dùng). Repo không đặt `session.expiresIn` (`packages/auth/src/index.ts:540-563`). | Quyết định 2026-11-12; docs Better Auth `concepts/session-management` |
| OQ-003 | Có cần chuẩn hóa câu thông báo "sai email/mật khẩu" sang tiếng Việt không? | Resolved | Có, chưa làm. Câu hiện tại trong UI là tiếng Anh. Ghi vào backlog Việt hóa form đăng nhập. | Quyết định 2026-11-12; `apps/web/src/components/sign-in-form.tsx:32-33` |
| OQ-004 | Copy UI tiếng Anh còn thư tiếng Việt — chủ đích song ngữ hay chưa dịch? | Resolved | Chưa dịch, không phải chủ đích song ngữ. Mục tiêu là tiếng Việt cho người dùng cuối; copy tiếng Anh ở form đăng nhập là nợ cần trả (backlog). | Quyết định 2026-11-12; `apps/web/src/components/sign-in-form.tsx:32-33`, `packages/auth/src/mail/brand.ts` |
| OQ-005 | Quy trình thêm/bớt email allowlist khi vận hành (hiệu lực ngay hay cần phiên mới)? | Resolved | Giáo viên: `TEACHER_EMAILS` được đọc từ biến môi trường lúc deploy (`resolveTeacherEmails`, rỗng = không giới hạn ở dev/e2e/staging, bắt buộc đặt ở production), nên đổi allowlist = đổi biến rồi deploy lại. Admin: `ADMIN_EMAILS` cũng là binding môi trường, gate so khớp lại ở MỖI request nên gỡ email là mất quyền ngay, không cần đợi phiên hết hạn. Chưa kiểm tra có cơ chế nạp lại không cần deploy hay không. | `packages/infra/alchemy.run.ts:158-162,219`, `packages/infra/src/topology.ts:168`, `apps/server/src/lib/require-admin.ts:8-17` |
| OQ-006 | Giới hạn tần suất theo từng isolate Cloudflare Worker có đủ chống lạm dụng không? | Open (đã sửa mô tả) | Sửa lại nhận định cũ: cooldown gửi OTP 60 giây của repo lưu trong bảng `verification` của DB (key `otp-cooldown:<email>`), dùng chung giữa các isolate, nên không có vấn đề này. Giới hạn 3 lần/60 giây cho `/request-password-reset` và các route tương tự là rate limit mặc định của Better Auth, lưu `memory` theo từng isolate và chỉ bật ở production (theo tài liệu/source thư viện). Repo không cấu hình `storage: "database"` hay `secondaryStorage` trong phần đã đọc. Hệ quả: giới hạn đặt lại mật khẩu không được đảm bảo toàn hệ thống. Có đủ hay không là quyết định rủi ro, chưa chốt. | `packages/auth/src/index.ts:151-198`, `apps/web/src/components/auth/forgot-password-form.tsx:18-19`; docs Better Auth `concepts/rate-limit` |
| OQ-007 | Giáo viên có cần đăng nhập OTP như học viên không? | Resolved | Không. OTP chỉ dành cho học viên; giáo viên dùng mật khẩu hoặc Google. Khớp với I-3. | Quyết định 2026-11-12; `packages/auth/src/index.ts:380-425` |
| OQ-008 | Tài khoản Google trùng email với tài khoản mật khẩu: gộp hay hai tài khoản riêng? | Resolved (chính sách) | Chính sách mong muốn: gộp thành một tài khoản. Theo tài liệu Better Auth, account linking bật sẵn và Google tự gộp vào user cũ khi provider báo email đã xác minh VÀ user cũ đã xác minh email (`requireLocalEmailVerified` mặc định `true`); thiếu một điều kiện thì lỗi `account_not_linked`. Repo không cấu hình `accountLinking`, nên chạy theo mặc định này. Chưa có test xác nhận hành vi thật; source thư viện có `FIXME` về việc bỏ `requireLocalEmailVerified` ở bản minor sau. | Quyết định 2026-11-12; `packages/auth/src/auth-reset-password.test.ts:257-293`; docs Better Auth `concepts/users-accounts` |
| OQ-009 | Trang đăng ký console quản trị (`apps/admin/src/routes/register.tsx`) thuộc feature nào, có còn dùng không? | Resolved | Thuộc cổng admin (plan #413), không thuộc app giáo viên. Đăng ký trên origin admin bị chặn nếu email ngoài `ADMIN_EMAILS` (mã `ACCOUNT_ADMIN_SIGNUP_FORBIDDEN`). Route còn tồn tại trong `apps/admin/src/routes`. | `apps/admin/src/routes/register.tsx`, `packages/api/src/contracts.ts:1987-1989` |

## Gaps (khoảng trống phát hiện khi đọc code)

| # | Khoảng trống | Chứng cứ tra ngược (negative-search) | Loại | Nhãn | Trạng thái | Nguồn quyết định |
|---|---|---|---|---|---|---|
| G-1 | `apps/web/src/routes/register.tsx` được liệt kê trong kế hoạch nguồn nhưng KHÔNG tồn tại; đăng ký nằm trong tab của `/login` | tìm file `register*` trong `apps/web/src` → chỉ có form trong components; `apps/web/src/routes` chỉ gồm `_auth`, `forgot-password`, `index`, `login`, `reset-password`, `pay.$token` | dead-code-nghi/deal-gap | 🟡 | Resolved | Quyết định 2026-11-12: không có route web `register` là đúng thiết kế; đăng ký giáo viên là tab của `/login` |
| G-2 | Không có E2E tự động cho luồng Google đăng nhập | tìm "google" trong `apps/e2e/specs` → chỉ `apps/e2e/specs/profile.spec.ts:87,150` (liên kết tài khoản, không phải đăng nhập). Comment tại `profile.spec.ts:10-12` nêu boot e2e chỉ có credential Google giả nên không tự động hóa được luồng thật | test-skip | 🟡 | Accepted-gap | Quyết định 2026-11-12; `apps/e2e/specs/profile.spec.ts:10-12` |
| G-3 | Thời hạn phiên chưa cấu hình — dùng mặc định nền service | đọc khối cấu hình auth không thấy expiresIn session | code-câm | 🟡 | Resolved | Chấp nhận mặc định thư viện (7 ngày, gia hạn sau 1 ngày); xem OQ-002 |
| G-4 | Câu lỗi gốc "sai thông tin đăng nhập" của nền service chưa pin vào catalog nội bộ | catalog nội bộ chỉ có mã chặn vai `packages/api/src/contracts.ts:1981-1996` | code-câm | 🟡 | Open | Giữ nguyên; UI đã hiển thị câu chung (`sign-in-form.tsx:32-33`), liên quan backlog Việt hóa ở OQ-003 |
| G-5 | Quản trị truy cập ứng dụng giáo viên: API chặn `ACCOUNT_ADMIN_ROLE` nhưng mã này KHÔNG nằm trong danh sách UI chuyển màn chặn → không thấy màn thân thiện, chỉ thấy lỗi truy vấn | `apps/web/src/lib/repos/kernel.ts:718-726` chỉ gộp STUDENT_ON_TEACHER_APP, TEACHER_NOT_ALLOWED, TEACHER_EMAIL_UNVERIFIED; `ADMIN_ON_TEACHER_APP` định nghĩa tại `packages/api/src/contracts.ts:1987` | dead-code-nghi | 🟡 | Open (backlog, lỗi thật) | Quyết định 2026-11-12: chưa sửa code trong đợt này; cần thêm mã vào `isStudentRoleRejected` kèm test |
| G-6 | Cờ `TEACHER_SIGNUP_ENABLED` khi TẮT: toàn bộ form đăng ký không render — chỉ còn tiêu thụ ở trang đăng nhập và cấu hình e2e | tìm "TEACHER_SIGNUP_ENABLED" toàn repo → `apps/web/src/lib/features.ts:11-15`, `apps/web/src/routes/login.tsx:37`, `apps/e2e/playwright.config.ts:96` | dead-code-nghi (flag-off) | 🟡 | Resolved | Cờ tắt là chủ đích của giai đoạn single-org (issue #539, `features.ts:11-13`); cách bật lại ở OQ-001 |
| C-1 | XUNG ĐỘT nguồn: đề bài liệt kê `apps/web/src/routes/register.tsx` làm nguồn; thực tế không tồn tại (chỉ `apps/admin/src/routes/register.tsx`). Tài liệu này theo code thật — đăng ký giáo viên = tab của `/login` | đối chiếu cây thư mục `apps/web/src/routes` | conflict | 🟡 | Resolved | Theo code thật; xem G-1 và OQ-009 |

## Inferred (suy luận có ≥2 chứng cứ code — không bịa)

| # | Suy luận | Chứng cứ 1 | Chứng cứ 2 | Nhãn |
|---|---|---|---|---|
| I-1 | Mặc định học viên là chủ đích "đặc quyền thấp nhất" | `packages/auth/src/role.ts:60` (default student) | `packages/auth/src/role.test.ts:105-133` (test least-privilege) | 🔵 |
| I-2 | Nền service giới hạn đặt lại mật khẩu 3 lần/60 giây | comment nêu rõ tại `apps/web/src/components/auth/forgot-password-form.tsx:18-19` | nhánh bắt mã 429 tại `apps/web/src/components/auth/forgot-password-form.tsx:46-50`; source Better Auth `v1.7.16` xác nhận quy tắc này, lưu `memory` theo isolate (xem OQ-006) | 🔵 |
| I-3 | OTP chỉ nhắm cổng học viên (UI OTP chỉ tồn tại ở apps/student) | chặn đường OTP teacher/admin `packages/auth/src/index.ts:366-425` | tìm OTP trong `apps/web/src` → không có màn hình OTP; đã được xác nhận bằng quyết định 2026-11-12 (OQ-007) | 🔵 |
| I-4 | Cookie chéo sub-domain là lý do phải chặn vai ở 3 tầng | comment thiết kế `packages/api/src/contracts.ts:1975-1981` | comment `apps/server/src/app.ts:221-223` | 🔵 |

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
