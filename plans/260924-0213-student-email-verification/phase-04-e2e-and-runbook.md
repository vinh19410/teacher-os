---
phase: 4
title: "E2E happy-path + RecordingMailer + Runbook"
status: completed
priority: P2
effort: 3h
dependencies: [1, 2, 3]
---

# Phase 4: E2E happy-path + RecordingMailer + Runbook

## Goal

Một spec Playwright chứng minh trọn vòng đời: đăng ký portal → thấy màn chờ xác thực (có nút Gửi lại) → lấy URL verify từ mailer giả → click URL → được provision và vào overview. Kèm runbook vận hành cho Resend.

Chặn số 1 của phase này là **origin**: e2e shim hiện chỉ trust origin web (`apps/e2e/src/boot.ts:26` — `CORS_ORIGIN` chỉ có `E2E_WEB_PORT ?? 8001`). Better-Auth validate Origin trên mọi POST và validate `callbackURL` ở CẢ sign-up body LẪN verify-email query (`origin-check.mjs`); Hono CORS cũng chỉ allow 8001. Thiếu origin 8003 → spec mới 403 ngay bước sign-up.

## Files to Create / Modify

- Modify: `apps/e2e/src/boot.ts` (CORS_ORIGIN gồm cả origin student + thay LogMailer bằng RecordingMailer)
- Modify: `apps/e2e/playwright.config.ts` (thêm webServer student + truyền `E2E_STUDENT_PORT` cho boot:api)
- Create: `apps/e2e/specs/student-portal-email-verification.spec.ts`
- Modify: `apps/e2e/specs/helpers.ts` (helper đọc mail log dạng mảng)
- Modify: `.gitignore` (root — thêm `apps/e2e/.mail-log.jsonl`)
- Modify: `docs/production-release-runbook.md` (mục vận hành email — **file runbook thật của repo**, KHÔNG tạo `docs/runbook.md` mới vì file đó không tồn tại)

## Tasks & Steps

### Task 4.1 — boot shim: origin student + RecordingMailer
- Goal: e2e đọc được URL verify mà Better-Auth sinh ra, không gửi mail thật, và portal origin được trust.
- Target files: `apps/e2e/src/boot.ts` (dòng 26 CORS_ORIGIN, dòng 44 createAuth).
- Steps:
  1. Đổi CORS_ORIGIN thành danh sách 2 origin, đọc port student từ env:
     ```ts
     const CORS_ORIGIN = [
       \`http://localhost:${Number(process.env.E2E_WEB_PORT ?? 8001)}\`,
       \`http://localhost:${Number(process.env.E2E_STUDENT_PORT ?? 8003)}\`,
     ].join(",");
     ```
     Cùng một biến này phải được dùng cho cả `buildApp` (CORS của Hono) lẫn `createAuth` (trustedOrigins) như hiện tại.
  2. Định nghĩa `RecordingMailer` hiện thực `Mailer` (import `@teacher-os/auth/mail/mailer`): mỗi lần `send` extract URL verify từ `input.text` bằng regex `/https?:\/\/[^\s]*\/verify-email\?[^\s]+/` (chặn ở mọi ký tự whitespace — text của template đặt URL trên dòng riêng), rồi append 1 dòng JSON `{ to, subject, url, at: new Date().toISOString() }` vào file `apps/e2e/.mail-log.jsonl`. Nếu không extract được URL → append dòng `{ to, error: "no-verify-url" }` (để test fail có tín hiệu thay vì im lặng).
  3. Xóa file log khi boot shim khởi động (mỗi lần chạy e2e là log mới).
- Success criteria: sau 1 lần đăng ký qua shim, `.mail-log.jsonl` có ≥ 1 dòng chứa URL `/verify-email?token=`; origin 8003 được trust.
- Verify: `pnpm --filter e2e check-types` → exit 0. (Chạy thật do Task 4.3 gate.)

### Task 4.2 — Thêm webServer student portal vào playwright config
- Goal: e2e có portal chạy thật để test UI, và boot shim biết port student.
- Target files: `apps/e2e/playwright.config.ts` (hiện 2 webServer: `boot:api` dòng ~41, vite web ~44-54).
- Steps:
  1. WebServer `boot:api`: thêm `E2E_STUDENT_PORT` vào env (cùng mức với `E2E_API_PORT`/`E2E_WEB_PORT` hiện có) để Task 4.1 đọc được.
  2. Clone webServer thứ hai thành webServer thứ ba cho apps/student: command `pnpm --filter student exec vite dev --port ${E2E_STUDENT_PORT ?? 8003} --strictPort`, env `VITE_SERVER_URL` cùng giá trị shim như web app, `reuseExistingServer: false`, `url` trỏ `/login`.
  3. Tổng số webServer = 3 (api shim, web, student); `workers: 1` giữ nguyên.
- Success criteria: `playwright test` boot đủ 3 server, không xung đột port.
- Verify: `pnpm --filter e2e exec playwright test --list` → exit 0.

### Task 4.3 — Spec happy-path `student-portal-email-verification.spec.ts`
- Goal: bằng chứng tự động cho toàn bộ user journey của feature.
- Target files: `apps/e2e/specs/student-portal-email-verification.spec.ts` (mới); `apps/e2e/specs/helpers.ts`.
- Steps:
  1. Helper mới trong `helpers.ts`: `readVerificationEmails(): Array<{ to: string; url: string }> đọc toàn bộ `.mail-log.jsonl` (mỗi dòng 1 JSON), retry ngắn theo pattern `withBusyRetry` (dòng 28) vì file ghi bất đồng bộ. Assertion "số lượng tăng" cần mảng, không dùng "dòng cuối".
  2. Test 1 — happy path (dùng **email duy nhất** sinh theo pattern `helpers.ts:16` — `e2e-${Date.now()}-${random}@test.local`; tuyệt đối không tái dùng email giữa các test):
     - Mở `http://localhost:${E2E_STUDENT_PORT}/login` (env khớp config).
     - Chuyển sang tab đăng ký, fill `#signup-name`, `#signup-email`, `#signup-password` (ids từ `sign-up-form.tsx:96-156`), submit.
     - Expect text "chưa được xác thực" xuất hiện, kèm email vừa đăng ký, **và nút "Gửi lại email" hiển thị** (assertion này gate việc truyền `userEmail` ở Phase 3 — nếu nút không render, dừng và escalate, đừng cố bypass).
     - Gọi `readVerificationEmails()` → có ≥ 1 entry chứa email đó; `page.goto(entry.url)`.
     - Better-Auth verify + `autoSignInAfterVerification` → redirect `/login` rồi về `/`; expect overview render bằng locator pin sẵn: `page.getByRole("heading", { name: /Chào/ })` (greeting header `greeting-header.tsx:27` render h1 "Chào {tên}") và expect KHÔNG còn text "chưa được xác thực".
     - Assert DB qua libsql `apps/e2e/local.db` (pattern `student-portal-provisioning.spec.ts:24-33`): `SELECT count(*) FROM student WHERE lower(trim(email)) = lower(?)` → = 1.
  3. Test 2 — "Gửi lại email" (email duy nhất thứ hai, riêng Test 1 — tái dùng email đã verify sẽ 422 `USER_ALREADY_EXISTS` ở sign-up hoặc 400 `EMAIL_ALREADY_VERIFIED` ở resend, làm log không tăng):
     - Sign-up như Test 1, chờ màn chờ xác thực hiện nút Gửi lại.
     - Ghi `before = readVerificationEmails().length`; bấm "Gửi lại email"; expect UI chuyển nhãn thành công.
     - Poll `readVerificationEmails()` (với `withBusyRetry`) tới khi `length > before` (timeout ~5s); entry mới chứa cùng email.
- Success criteria: cả 2 test pass 2 lần chạy liên tiếp.
- Verify: `pnpm --filter e2e e2e -- specs/student-portal-email-verification.spec.ts` → exit 0, output có `2 passed`. Chạy lần nữa → vẫn exit 0.

### Task 4.4 — Regression: spec provisioning cũ vẫn xanh
- Goal: chứng minh soft mode không phá teacher flow hiện có.
- Target files: không sửa — chỉ chạy.
- Steps:
  1. Chạy spec cũ trên môi trường mới (đã có 3 webServer + origin student trong shim).
- Success criteria: spec cũ pass — signup teacher trên web vẫn vào `/dashboard` (soft mode không chặn; teacher sign-up không truyền callbackURL nên default `"/"` relative, được origin-check chấp nhận), student count vẫn 0.
- Verify: `pnpm --filter e2e e2e -- specs/student-portal-provisioning.spec.ts` → exit 0.

### Task 4.5 — Runbook vận hành email
- Goal: người vận hành biết cách bật Resend ở prod, hiểu giới hạn và xử lý sự cố.
- Target files: `docs/production-release-runbook.md` (thêm mục "Email verification (Resend)").
- Steps:
  1. Bảng biến: `MAILER_IMPL` (`log` | `resend`, default `log`), `MAIL_FROM` (default `TeacherOS <onboarding@resend.dev>`), `RESEND_API_KEY` (secret — đặt qua CI secrets/alchemy, KHÔNG commit; boot sẽ throw nếu `MAILER_IMPL=resend` mà key rỗng, và in banner đỏ nếu đang chạy log-only).
  2. Quy trình lên prod: tạo tài khoản Resend → Add domain (DKIM/SPF theo dashboard) → đặt `MAIL_FROM="TeacherOS <no-reply@<domain>>"` → `MAILER_IMPL=resend` → set `RESEND_API_KEY` trong CI secrets **trước khi merge code** → deploy → đăng ký thử 1 tài khoản thật để xác nhận mail vào inbox.
  3. Quota & giám sát: free tier 100 email/ngày, 3.000/tháng — **bao gồm cả email verify gửi cho teacher đăng ký web app** (config auth dùng chung cho cả 2 app); theo dõi log server các chuỗi "resend send failed" / "Failed to send verification email".
  4. Chống lạm dụng: Better-Auth đã có sẵn rate rule 3 req/60s theo IP cho `/send-verification-email` (BA `rate-limiter/index.mjs:386-395`; lưu ý storage memory là per-isolate trên Workers) + endpoint có anti-enumeration (luôn trả `{status:true}`, timing floor 500ms). Nếu thấy dấu hiệu lạm dụng → escalate trước khi tự thêm rate limit tầng D1 (ngoài scope plan này).
  5. Sự cố thường gặp: mail vào spam → kiểm tra DKIM/SPF domain trên Resend; cần kích hoạt tay cho 1 user → `UPDATE user SET email_verified = 1 WHERE email = ?;` trên D1; user bảo "đã bấm gửi lại nhưng không có mail" → kiểm tra banner log-only + quota + log lỗi trước khi đoán elsewhere.
- Success criteria: runbook có mục mới đủ 5 nội dung trên.
- Verify: `grep -n "MAILER_IMPL" docs/production-release-runbook.md` → ≥ 1 hit.

## Verification (cả phase)

- `pnpm --filter e2e e2e` → exit 0 (toàn bộ spec, gồm spec cũ).
- `pnpm check` → exit 0; `pnpm check-types` → exit 0.
- `pnpm test` (root, turbo) → exit 0.

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
