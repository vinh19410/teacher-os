# UC-02 — Xác thực email (bấm link, gửi lại)

- **ID:** UC-02 · **Feature:** auth-student-signup · **Actor chính:** Học viên
- **a. Mô tả:** Học viên chứng minh quyền sở hữu email bằng link trong mail (hiệu lực 1 giờ); xong tự đăng nhập và thấy màn xác nhận. ✅ [S4][S14]
- **b. Actors phụ:** Mailer.
- **c. Tiền điều kiện:** Có USER với emailVerified=false; học viên nhận được mail.
- **d. Luồng chính:**
  1. Học viên mở mail, bấm nút xác thực → GET/POST /api/auth/verify-email với token.
  2. Server đặt emailVerified=true (packages/auth/src/index.ts:298-326).
  3. autoSignInAfterVerification tạo phiên ngay.
  4. Trình duyệt về `/verify-email?verified=ok`; màn xác nhận thành công khi `!error && verified === "ok"` (apps/student/src/components/auth/verify-email-view.tsx:25).
  5. Học viên vào portal → tiếp UC-05.
- **e. Luồng thay thế:**
  - 1a. Token hết hạn (>1 giờ) → màn "Liên kết không hoạt động": "Liên kết xác thực không hợp lệ, đã được sử dụng hoặc đã hết hạn. Hãy yêu cầu liên kết mới hoặc đăng nhập để tiếp tục." kèm nút gửi lại (verify-email-view.tsx:94-104 — OQ-11 đã giải quyết).
  - 2a. Tại thời điểm verify, session chạm app sai vai → gate ném redirect `callbackURL + error=ROLE_MISMATCH` về login (packages/auth/src/index.ts:524-533; test packages/auth/src/auth-verify-email-role.test.ts:77-113) — E-14.
  - 1b. Gửi lại mail thất bại → lỗi được ném về client (đường resend không nuốt lỗi — packages/auth/src/index.ts:308-322) — E-29: "Không thể gửi lại email. Vui lòng thử lại sau." (student-error-view.tsx:78).
- **f. Hậu điều kiện:** emailVerified=true; phiên mới hoạt động; portal mở được.
- **g. BR liên quan:** BR-014 bắt emailVerified ở portal; BR-004 mail link dùng domain cấu hình.
- **h. Nguồn:** S4, S10, S11, S14, S20 (E2E student-portal-email-verification.spec.ts:30-133, helper mail log).
