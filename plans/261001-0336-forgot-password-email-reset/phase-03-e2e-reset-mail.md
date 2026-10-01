---
phase: 3
title: "E2E hai cổng và changelog"
status: done
priority: P1
effort: 4h
dependencies: [1, 2]
---

# Phase 3: E2E hai cổng và changelog

## Goal

Một spec Playwright chứng minh teacher và student đều đổi được mật khẩu qua link trong mail log, và changelog ghi tính năng này.

## Files to Create / Modify

- Modify: `apps/e2e/src/boot.ts` (hàm `recordingMailer.send`)
- Modify: `apps/e2e/specs/helpers.ts` (chỉ khi cần đọc field mới; không đổi chữ ký `readVerificationEmails`)
- Create: `apps/e2e/specs/password-reset.spec.ts`
- Modify: `CHANGELOG.md`

## Tasks & Steps

### Task 3.1 — Mail log giữ URL reset

- Goal: thư reset có `url` dùng được, thư xác thực giữ nguyên shape cũ.
- Target files: `apps/e2e/src/boot.ts`, biến `recordingMailer`.
- Steps:
  1. Giữ nguyên nhánh `input.text` match `/https?:\/\/[^\s]*\/verify-email\?[^\s]+/` (regex hiện tại ở `apps/e2e/src/boot.ts`, `\?` là dấu `?` literal). Dòng JSON vẫn là `{ to, subject, url, at }`.
  2. Thêm nhánh sau đó: nếu text match `/https?:\/\/[^\s]*\/api\/auth\/reset-password\/[^\s?]+\?[^\s]+/` (đúng dạng `<base>/api/auth/reset-password/<token>?callbackURL=...` mà better-auth phát hành), ghi `{ to, subject, url: match[0], kind: "password-reset", at }`.
  3. Chỉ khi không match cả hai, giữ nhánh `error: "no-verify-url"` như hiện tại.
  4. Không đổi `MAIL_LOG_PATH`. Không đổi `readVerificationEmails`. Field `kind` là optional với reader cũ.
- Success criteria: một thư verify và một thư reset trong cùng file jsonl đều có `url`.
- Verify: `no verification needed` — task 3.2 là chỗ chứng minh.

### Task 3.2 — Spec teacher và student

- Goal: mật khẩu cũ chết, mật khẩu mới đăng nhập được, email lạ không tạo thư reset.
- Target files: `apps/e2e/specs/password-reset.spec.ts`.
- Steps:
  1. Import `signUpViaUi` và `readVerificationEmails` từ `./helpers`.
  2. Test teacher:
     - `signUpViaUi(page, { password: "password-8chars" })` lấy email.
     - `page.context().clearCookies()` rồi `page.goto("/login")`. Tab mặc định có thể vẫn là Create account vì `localStorage` key `teacher-os-auth-tab`. Bấm `#tab-signin` trước. Không giả định helper sign-out.
     - Bấm link `Forgot password?`. URL kết thúc bằng `/forgot-password`.
     - Điền email vừa đăng ký, submit `Email me a reset link`.
     - Expect câu `If an account exists for that email, we sent a reset link. It expires in 1 hour.`
     - Poll `readVerificationEmails()` tối đa 20 lần, mỗi lần cách 500ms, giống vòng lặp trong `student-portal-email-verification.spec.ts`. Chọn dòng `to` đúng email, `subject` chứa `Đặt lại mật khẩu`, và có `url`. Bỏ dòng thư xác thực sign-up.
     - `page.goto(url)`. Expect URL cuối chứa `/reset-password` và có `token`.
     - Điền mật khẩu mới `newpassword123` hai lần, submit `Update password`.
     - Expect `Password updated`. `page.goto("/login")`, bấm `#tab-signin`, điền `#si-email` và `#si-password`, bấm nút `Sign in`. Expect URL `/dashboard` trong 30s.
     - `page.context().clearCookies()`, `page.goto("/login")`, bấm `#tab-signin`, điền `#si-email` và `#si-password` bằng `password-8chars`. Bọc thao tác bấm `Sign in` trong `Promise.all` với `page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"))` và expect `response.status()` không phải 200. Sau đó expect `#si-password` vẫn hiển thị. Không chỉ assert URL: `not.toHaveURL(/dashboard/)` pass ngay tại t=0 trước khi request xong.
  3. Playwright chỉ có một project `chromium`. `baseURL` là web. Student không có project riêng. Import `STUDENT_ORIGIN` từ `./origins` như `apps/e2e/specs/student-portal-email-verification.spec.ts`. Mọi URL student là tuyệt đối `${STUDENT_ORIGIN}/...`, không dùng `page.goto("/login")` cho học viên vì path đó rơi vào web.
     - Đăng ký bằng các locator trong spec đó: `#tab-signup`, `#signup-name`, `#signup-email`, `#signup-password`, mật khẩu `password-8chars`.
     - Sau đăng ký student đã có session và `/login` của student điều hướng đi khi có session (`apps/student/src/routes/login.tsx`). Gọi `page.context().clearCookies()` TRƯỚC `page.goto(`${STUDENT_ORIGIN}/login`)`, nếu không `#tab-signin` không bao giờ hiện.
     - `page.goto(`${STUDENT_ORIGIN}/login`)`, bấm `#tab-signin` (tab có thể đang là Đăng ký), rồi bấm `Quên mật khẩu?`.
     - Submit email, expect câu `Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ.`
     - Poll mail log như test teacher. Mở `url`. URL cuối phải bắt đầu bằng `STUDENT_ORIGIN` và chứa `/reset-password`.
     - Đặt mật khẩu mới `newpassword123`, expect `Đã đổi mật khẩu.`
     - `page.goto(`${STUDENT_ORIGIN}/login`)`, bấm `#tab-signin`, điền `#signin-email` và `#signin-password`, bấm `Đăng nhập`. Expect URL không còn kết thúc bằng `/login` trong 20s. Học viên mới có thể rơi vào `/` hoặc `/onboarding`. Không assert chữ `Email chưa được xác thực`, vì màn đó phụ thuộc mã lỗi của `useStudentMe`, không phải của reset.
     - `page.context().clearCookies()`, `page.goto(`${STUDENT_ORIGIN}/login`)`, bấm `#tab-signin`, đăng nhập lại bằng `password-8chars` với `Promise.all` + `page.waitForResponse` tới `/api/auth/sign-in/email`. Expect `response.status()` không phải 200, rồi expect `#signin-password` còn trên trang.
     - Mở thêm `${STUDENT_ORIGIN}/reset-password?token=invalid` khi chưa đăng nhập: expect `Liên kết đặt lại không hợp lệ hoặc đã hết hạn.` Rồi đăng nhập student bằng mật khẩu mới để có session và mở lại cùng URL: expect vẫn thấy câu đó (không bị đẩy sang `/`).
  4. Test email lạ trên web: đăng ký một user thật (`signUpViaUi`), `clearCookies`, mở `/forgot-password`. Submit email lạ `nobody-{timestamp}@test.local` trước, expect cùng câu thành công tiếng Anh. Rồi submit email của user thật trên cùng trang (tải lại `/forgot-password`), expect cùng câu. Poll mail log cho đến khi dòng reset của user thật xuất hiện, và chỉ sau đó mới assert `readVerificationEmails()` không có dòng reset nào với `to` bằng email lạ. Thứ tự này loại race nếu mail được gửi nền.
  5. Test trang reset web khi đang đăng nhập: `signUpViaUi` (có session), `page.goto("/reset-password?token=invalid")`: expect `This reset link is invalid or has expired.` và URL không bị đẩy sang `/dashboard`.
  6. Dùng timeout 30s cho bước chờ dashboard, cùng lý do `signUpViaUi` đã ghi.
- Success criteria: bốn test có tên mô tả teacher reset, student reset, unknown email, và reset page with an existing session.
- Verify: lệnh dưới exit 0 và output chứa `4 passed` cho file này, không cần suite e2e còn lại.
  `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e specs/password-reset.spec.ts`
  Cổng 8000/8001/8003 là dev stack. Không đổi default của playwright config.

### Task 3.3 — Changelog

- Goal: nhật ký ngày có một dòng Added cho tính năng.
- Target files: `CHANGELOG.md`.
- Steps:
  1. Nếu chưa có `## 2026-10-01`, thêm mục đó trên mục ngày mới nhất hiện có (`## 2026-09-30`).
  2. Dưới `### Added`, thêm một bullet: người dùng teacher và student xin được liên kết đặt lại mật khẩu qua email và đặt mật khẩu mới trên `/reset-password` của đúng cổng. Cuối dòng ghi `(#<issue>)` với số issue trong frontmatter `plan.md`. Nếu frontmatter vẫn là `issue: 0`, ghi `(plan 261001-0336)` thay vì số bịa.
- Success criteria: không sửa các mục ngày cũ.
- Verify: `rg -n "Đặt lại mật khẩu|reset-password" CHANGELOG.md` in ra dòng mới dưới `## 2026-10-01`.

## Security Considerations

- Spec không in full mail log ra stdout. Assert trên `url` của đúng `to`.
- Unknown-email test là hàng rào chống lộ tài khoản. Không nới expect thành "có hoặc không có thư".
- Rate limit của better-auth tắt ở e2e (không phải production), nên spec không kiểm 429; UI 429 được unit test phase 2 phủ.

## Failure Protocol

If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
